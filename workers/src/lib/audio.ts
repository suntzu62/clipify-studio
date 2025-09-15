import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { logger } from '../logger';

// Set ffmpeg path
if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
} else if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

interface SilenceBoundary {
  start: number;
  end?: number;
}

export async function runSilenceDetect(inputPath: string): Promise<SilenceBoundary[]> {
  const silenceDb = process.env.SCENES_SILENCE_DB || '-35';
  const silenceMin = process.env.SCENES_SILENCE_MIN || '0.3';
  
  return new Promise((resolve, reject) => {
    const boundaries: SilenceBoundary[] = [];
    let stderrOutput = '';
    
    ffmpeg(inputPath)
      .audioFilters(`silencedetect=n=${silenceDb}dB:d=${silenceMin}`)
      .format('null')
      .output('-')
      .on('stderr', (stderrLine) => {
        stderrOutput += stderrLine + '\n';
      })
      .on('end', () => {
        // Parse stderr for silence events
        const lines = stderrOutput.split('\n');
        let currentSilence: Partial<SilenceBoundary> = {};
        
        for (const line of lines) {
          const silenceStartMatch = line.match(/silence_start: ([\d.]+)/);
          const silenceEndMatch = line.match(/silence_end: ([\d.]+)/);
          
          if (silenceStartMatch) {
            const start = parseFloat(silenceStartMatch[1]);
            currentSilence = { start };
          } else if (silenceEndMatch && currentSilence.start !== undefined) {
            const end = parseFloat(silenceEndMatch[1]);
            boundaries.push({ start: currentSilence.start, end });
            currentSilence = {};
          }
        }
        
        // Handle unclosed silence (at end of file)
        if (currentSilence.start !== undefined) {
          const minDuration = parseFloat(silenceMin);
          boundaries.push({ 
            start: currentSilence.start, 
            end: currentSilence.start + minDuration 
          });
        }
        
        logger.info(`Detected ${boundaries.length} silence boundaries`);
        resolve(boundaries);
      })
      .on('error', (err) => {
        logger.error({ error: err.message }, 'FFmpeg silence detection failed');
        reject({ code: 'AUDIO_ANALYSIS_ERROR', message: err.message });
      })
      .run();
  });
}