import { promises as fs } from 'fs';
import { join } from 'path';
import pino from 'pino';

const log = pino({ name: 'ytdlp-plugin-installer' });

const PLUGIN_URL = 'https://github.com/coletdjnz/yt-dlp-youtube-oauth2/releases/latest/download/yt-dlp-youtube-oauth2.zip';

/**
 * Garante que o plugin OAuth2 do yt-dlp está instalado
 * URL: https://github.com/coletdjnz/yt-dlp-youtube-oauth2
 */
export async function ensureYtDlpOAuth2Plugin(
  pluginDir: string = '/tmp/yt-dlp-plugins'
): Promise<string> {
  try {
    // 1. Verificar se o plugin já existe
    const pluginPath = join(pluginDir, 'yt_dlp_plugins', 'extractor', 'youtube_oauth2.py');
    
    try {
      await fs.access(pluginPath);
      log.info({ pluginPath }, 'yt-dlp OAuth2 plugin already installed');
      return pluginDir;
    } catch {
      log.info('yt-dlp OAuth2 plugin not found, installing...');
    }
    
    // 2. Criar diretório de plugins
    await fs.mkdir(pluginDir, { recursive: true });
    
    // 3. Baixar plugin
    log.info({ url: PLUGIN_URL }, 'Downloading yt-dlp OAuth2 plugin');
    
    const response = await fetch(PLUGIN_URL);
    if (!response.ok) {
      throw new Error(`Failed to download plugin: ${response.status} ${response.statusText}`);
    }
    
    const zipBuffer = Buffer.from(await response.arrayBuffer());
    
    // 4. Extrair plugin usando adm-zip
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(zipBuffer);
    zip.extractAllTo(pluginDir, true);
    
    log.info({ pluginDir }, 'Successfully installed yt-dlp OAuth2 plugin');
    
    return pluginDir;
    
  } catch (error: any) {
    log.error({ error: error.message }, 'Failed to install yt-dlp OAuth2 plugin');
    throw error;
  }
}
