import { promises as fs } from 'fs';
import { join } from 'path';
import https from 'https';
import pino from 'pino';

const log = pino({ name: 'ytdlp-plugin-installer' });

/**
 * Instala o plugin OAuth2 do yt-dlp
 * 
 * Download do repositório oficial: https://github.com/coletdjnz/yt-dlp-youtube-oauth2
 */
export async function ensureYtDlpOAuth2Plugin(
  pluginDir: string = '/tmp/yt-dlp-plugins'
): Promise<string> {
  const pluginPath = join(pluginDir, 'yt_dlp_plugins', 'extractor');
  const pluginFile = join(pluginPath, 'youtube_oauth2.py');
  
  // Verificar se já existe
  try {
    await fs.access(pluginFile);
    log.info({ pluginFile }, 'yt-dlp OAuth2 plugin already installed');
    return pluginDir;
  } catch {
    // Plugin não existe, fazer download
  }
  
  log.info('Installing yt-dlp OAuth2 plugin from GitHub');
  
  // Criar estrutura de diretórios
  await fs.mkdir(pluginPath, { recursive: true });
  
  // URLs dos arquivos do plugin
  const pluginFiles = [
    {
      url: 'https://raw.githubusercontent.com/coletdjnz/yt-dlp-youtube-oauth2/master/yt_dlp_plugins/__init__.py',
      path: join(pluginDir, 'yt_dlp_plugins', '__init__.py')
    },
    {
      url: 'https://raw.githubusercontent.com/coletdjnz/yt-dlp-youtube-oauth2/master/yt_dlp_plugins/extractor/__init__.py',
      path: join(pluginPath, '__init__.py')
    },
    {
      url: 'https://raw.githubusercontent.com/coletdjnz/yt-dlp-youtube-oauth2/master/yt_dlp_plugins/extractor/youtube_oauth2.py',
      path: pluginFile
    }
  ];
  
  // Baixar todos os arquivos
  for (const file of pluginFiles) {
    await downloadFile(file.url, file.path);
    log.info({ file: file.path }, 'Downloaded plugin file');
  }
  
  log.info({ pluginDir }, 'yt-dlp OAuth2 plugin installed successfully');
  
  return pluginDir;
}

async function downloadFile(url: string, targetPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (!redirectUrl) {
          reject(new Error('Redirect without location'));
          return;
        }
        downloadFile(redirectUrl, targetPath).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed: ${response.statusCode}`));
        return;
      }
      
      const file = require('fs').createWriteStream(targetPath);
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
      
      file.on('error', (err: Error) => {
        file.close();
        fs.unlink(targetPath).catch(() => {});
        reject(err);
      });
    }).on('error', reject);
  });
}
