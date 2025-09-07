import { spawn } from 'node:child_process';

export async function runFFmpeg(
  args: string[],
  onProgress?: (p: number) => void,
  durationMs?: number
): Promise<void> {
  const ffmpegBin = process.env.FFMPEG_PATH || 'ffmpeg';

  const fullArgs = [
    '-hide_banner',
    '-y',
    '-nostdin',
    '-loglevel', 'error',
    '-stats_period', '0.5',
    '-progress', 'pipe:1',
    ...args,
  ];

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegBin, fullArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

    proc.stdout?.on('data', (buf: Buffer) => {
      const s = buf.toString();
      // -progress prints key=value pairs separated by newlines
      const m = s.match(/out_time_ms=(\d+)/);
      if (m && durationMs && onProgress) {
        const cur = Number(m[1]);
        const pct = Math.max(0, Math.min(100, Math.round((cur / (durationMs * 1000)) * 100)));
        onProgress(pct);
      }
    });

    let err = '';
    proc.stderr?.on('data', (buf: Buffer) => {
      err += buf.toString();
    });

    proc.on('error', (e) => reject(e));
    proc.on('close', (code) => {
      if (code === 0) return resolve();
      const info = `ffmpeg exited with code ${code}. Args: ${fullArgs.join(' ')}`;
      reject(new Error(err || info));
    });
  });
}

