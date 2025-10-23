import { promises as fs } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import https from 'https';
import pino from 'pino';

const log = pino({ name: 'yt-dlp' });

/**
 * Ensures yt-dlp binary is available and returns its path.
 * 
 * Priority:
 * 1. YTDLP_BINARY env var (if set and executable)
 * 2. Standard paths (/opt/render/project/.cache/yt-dlp, /tmp/yt-dlp)
 * 3. Download from GitHub releases if not found
 * 
 * @returns Path to the yt-dlp binary
 * @throws Error if binary cannot be obtained or made executable
 */
export async function ensureYtDlpBinary(): Promise<string> {
  // 1. Check environment variable
  const envBinary = process.env.YTDLP_BINARY;
  if (envBinary) {
    try {
      await fs.access(envBinary, fs.constants.X_OK);
      log.info({ path: envBinary }, 'Using yt-dlp from YTDLP_BINARY env var');
      return envBinary;
    } catch {
      log.warn({ path: envBinary }, 'YTDLP_BINARY set but not executable, continuing with fallback');
    }
  }

  // 2. Check standard paths
  const standardPaths = [
    '/opt/render/project/.cache/yt-dlp',
    '/tmp/yt-dlp',
  ];

  for (const path of standardPaths) {
    try {
      await fs.access(path, fs.constants.X_OK);
      log.info({ path }, 'Found existing yt-dlp binary');
      return path;
    } catch {
      // Not found or not executable, continue
    }
  }

  // 3. Download binary
  log.info('yt-dlp binary not found, downloading from GitHub releases');
  
  const downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
  const targetPaths = [
    '/opt/render/project/.cache/yt-dlp',
    '/tmp/yt-dlp',
  ];

  let lastError: Error | null = null;

  for (const targetPath of targetPaths) {
    try {
      // Create directory if needed
      const dir = targetPath.substring(0, targetPath.lastIndexOf('/'));
      await fs.mkdir(dir, { recursive: true });

      // Download binary
      log.info({ url: downloadUrl, target: targetPath }, 'Downloading yt-dlp binary');
      await downloadFile(downloadUrl, targetPath);

      // Make executable
      await fs.chmod(targetPath, 0o755);
      
      // Verify it works
      try {
        execSync(`${targetPath} --version`, { encoding: 'utf-8', timeout: 5000 });
        log.info({ path: targetPath }, 'Successfully downloaded and verified yt-dlp binary');
        return targetPath;
      } catch (verifyError: any) {
        throw new Error(`Downloaded binary at ${targetPath} is not executable: ${verifyError.message}`);
      }
    } catch (error: any) {
      lastError = error;
      log.warn({ path: targetPath, error: error.message }, 'Failed to download yt-dlp to this path, trying next');
    }
  }

  // All attempts failed
  throw new Error(
    `Failed to obtain yt-dlp binary. Last error: ${lastError?.message || 'unknown'}. ` +
    `Tried paths: ${targetPaths.join(', ')}`
  );
}

/**
 * Downloads a file from URL to target path
 */
async function downloadFile(url: string, targetPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = require('fs').createWriteStream(targetPath);
    
    https.get(url, (response) => {
      // Follow redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (!redirectUrl) {
          reject(new Error('Redirect without location header'));
          return;
        }
        file.close();
        downloadFile(redirectUrl, targetPath).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (err: Error) => {
        file.close();
        fs.unlink(targetPath).catch(() => {}); // Clean up partial download
        reject(err);
      });
    }).on('error', (err: Error) => {
      file.close();
      fs.unlink(targetPath).catch(() => {});
      reject(err);
    });
  });
}
