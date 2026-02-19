import { promises as fs } from 'fs';
import { join } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { createLogger } from '../config/logger.js';
import type { AspectRatio, ReframeResult, SubtitlePreferences } from '../types/index.js';
import { buildSubtitlesFilter, getResolutionForFormat } from './rendering.js';
import { generateCropFilter } from './roi-detector.js';

const logger = createLogger('clip-reprocessor');

export interface ReprocessOptions {
  jobId: string;
  clipId: string;
  originalVideoPath: string;
  format?: AspectRatio;
  reframeSettings?: ReframeResult;
  clipData: any;
  subtitlePreferences: SubtitlePreferences;
  onProgress?: (progress: number, message: string) => void;
}

export interface ReprocessResult {
  videoPath: string;
  thumbnailPath: string;
  duration: number;
}

/**
 * Reprocessa um único clip com novas preferências de legendas
 * Otimizado para MÁXIMA QUALIDADE (mesmas configurações do rendering principal)
 * Usa CRF 16, preset slow, e todas as otimizações de qualidade
 */
export async function reprocessClip(options: ReprocessOptions): Promise<ReprocessResult> {
  const {
    jobId,
    clipId,
    originalVideoPath,
    clipData,
    subtitlePreferences,
    onProgress,
    format = '9:16',
    reframeSettings,
  } = options;

  logger.info({ jobId, clipId }, 'Starting high-quality clip reprocessing');

  const startTime = Date.now();

  // Criar diretório temporário para output
  const outputDir = join('/tmp', `reprocess-${clipId}-${Date.now()}`);
  await fs.mkdir(outputDir, { recursive: true });

  const videoOutputPath = join(outputDir, `${clipId}.mp4`);
  const thumbnailOutputPath = join(outputDir, `${clipId}.jpg`);

  try {
    // Extrair informações do clip
    const { start_time, end_time, transcript } = clipData;
    const duration = end_time - start_time;

    if (onProgress) {
      await onProgress(10, 'Preparando reprocessamento...');
    }

    // Verificar se o vídeo original existe
    try {
      await fs.access(originalVideoPath);
    } catch (error) {
      throw new Error(`Original video not found at ${originalVideoPath}. Cannot reprocess.`);
    }

    if (onProgress) {
      await onProgress(20, 'Gerando legendas com novos estilos...');
    }

    // Build subtitle filter com as novas preferências
    const { width, height } = getResolutionForFormat(format);

    const subtitlesFilter = await buildSubtitlesFilter(
      transcript,
      start_time,
      end_time,
      outputDir,
      clipId,
      subtitlePreferences,
      { width, height }
    );

    if (onProgress) {
      await onProgress(40, 'Renderizando vídeo...');
    }

    // Renderizar com ALTA QUALIDADE (mesmas configurações do rendering principal)
    const vfFilters: string[] = [];

    const scaleParams = 'flags=lanczos';

    if (reframeSettings?.enabled && reframeSettings.roi) {
      // Preserva o reenquadramento original quando disponível
      vfFilters.push(
        generateCropFilter(reframeSettings.roi),
        `scale=${width}:${height}:${scaleParams}`
      );
    } else {
      // Fallback: crop central por formato
      if (format === '9:16') {
        vfFilters.push(
          `crop=ih*9/16:ih:(iw-ih*9/16)/2:0`,
          `scale=${width}:${height}:${scaleParams}`
        );
      } else if (format === '1:1') {
        vfFilters.push(
          `crop=min(iw\\,ih):min(iw\\,ih):(iw-min(iw\\,ih))/2:(ih-min(iw\\,ih))/2`,
          `scale=${width}:${height}:${scaleParams}`
        );
      } else if (format === '4:5') {
        vfFilters.push(
          `crop=ih*4/5:ih:(iw-ih*4/5)/2:0`,
          `scale=${width}:${height}:${scaleParams}`
        );
      } else {
        vfFilters.push(`scale=${width}:${height}:${scaleParams}`);
      }
    }

    // Adicionar legendas
    if (subtitlesFilter) {
      vfFilters.push(subtitlesFilter);
    }

    const vf = vfFilters.join(',');

    // Audio normalization (mesma do rendering principal)
    const af = 'loudnorm=I=-14:LRA=11:TP=-1.5';

    await new Promise<void>((resolve, reject) => {
      ffmpeg(originalVideoPath)
        .setStartTime(start_time)
        .duration(duration)
        .outputOptions([
          '-map', '0:v:0',
          '-map', '0:a:0',
          '-vf', vf,
          '-af', af,
          '-c:v', 'libx264',
          '-preset', 'slow', // QUALIDADE MÁXIMA: slow preset para melhor compressão
          '-tune', 'film', // Otimiza para conteúdo filmado (preserva detalhes)
          '-threads', '8', // Mais threads para compensar preset slow
          '-profile:v', 'high',
          '-level', '4.2', // Level 4.2 adequado para 1080p
          '-pix_fmt', 'yuv420p',
          '-crf', '16', // CRF 16 = Qualidade excelente (ideal para 1080p)
          '-b:v', '12M', // 12 Mbps para máxima qualidade em reprocessamento 1080p
          '-maxrate', '15M', // Picos de qualidade
          '-bufsize', '20M', // Buffer adequado
          '-g', '60', // GOP maior = melhor qualidade em cenas estáticas
          '-keyint_min', '30',
          '-refs', '5', // Frames de referência
          '-bf', '3', // B-frames para melhor compressão sem perda
          '-x264-params', 'aq-mode=3:aq-strength=0.8', // Adaptive quantization para preservar detalhes
          '-c:a', 'aac',
          '-b:a', '192k', // 192k áudio de alta qualidade
          '-ac', '2',
          '-ar', '48000',
          '-movflags', '+faststart',
        ])
        .on('progress', (progress) => {
          if (onProgress && progress.percent) {
            const renderProgress = 40 + Math.floor((progress.percent / 100) * 40);
            onProgress(renderProgress, `Renderizando: ${Math.floor(progress.percent)}%`);
          }
        })
        .on('end', () => {
          logger.info({ clipId, duration: Date.now() - startTime }, 'Video reprocessing completed');
          resolve();
        })
        .on('error', (err) => {
          logger.error({ clipId, error: err.message }, 'Video reprocessing failed');
          reject(err);
        })
        .save(videoOutputPath);
    });

    if (onProgress) {
      await onProgress(85, 'Gerando thumbnail...');
    }

    // Gerar thumbnail na metade do vídeo
    const thumbnailTime = duration / 2;
    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoOutputPath)
        .seekInput(thumbnailTime)
        .outputOptions(['-vframes 1', '-q:v 2'])
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .save(thumbnailOutputPath);
    });

    if (onProgress) {
      await onProgress(100, 'Reprocessamento concluído!');
    }

    const totalTime = Date.now() - startTime;
    logger.info(
      { jobId, clipId, totalTime, outputDir },
      `Clip reprocessed successfully in ${totalTime}ms`
    );

    return {
      videoPath: videoOutputPath,
      thumbnailPath: thumbnailOutputPath,
      duration,
    };
  } catch (error: any) {
    logger.error({ error: error.message, jobId, clipId }, 'Clip reprocessing failed');
    throw new Error(`Reprocessing failed: ${error.message}`);
  }
}
