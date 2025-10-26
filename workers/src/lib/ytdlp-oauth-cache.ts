import { promises as fs } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import { decryptToken } from './crypto';
import pino from 'pino';

const log = pino({ name: 'ytdlp-oauth-cache' });

/**
 * Cria arquivo de cache OAuth2 para o plugin do yt-dlp
 * Formato: /tmp/yt-dlp-cache/oauth2-{userId}.json
 */
export async function createYtDlpOAuthCache(
  userId: string,
  cacheDir: string = '/tmp/yt-dlp-cache'
): Promise<string | null> {
  try {
    // 1. Criar diretório de cache
    await fs.mkdir(cacheDir, { recursive: true });
    
    // 2. Buscar tokens OAuth do Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    const { data: account } = await supabase
      .from('youtube_accounts')
      .select('access_token, refresh_token, expiry_date')
      .eq('user_id', userId)
      .single();
    
    if (!account) {
      log.info({ userId }, 'No YouTube account found for user');
      return null;
    }
    
    // 3. Descriptografar tokens
    const accessToken = account.access_token ? decryptToken(account.access_token) : null;
    const refreshToken = account.refresh_token ? decryptToken(account.refresh_token) : null;
    
    if (!refreshToken) {
      log.warn({ userId }, 'No refresh token found');
      return null;
    }
    
    // 4. Criar objeto de cache no formato esperado pelo yt-dlp
    const expiresAt = Math.floor(new Date(account.expiry_date).getTime() / 1000);
    
    const cacheData = {
      refresh_token: refreshToken,
      access_token: accessToken || undefined,
      token_type: 'Bearer',
      expires_at: expiresAt
    };
    
    // 5. Salvar cache em arquivo JSON
    const cacheFilePath = join(cacheDir, `oauth2-${userId}.json`);
    await fs.writeFile(
      cacheFilePath,
      JSON.stringify(cacheData, null, 2),
      'utf-8'
    );
    
    // 6. Aplicar permissões restritivas (apenas owner pode ler/escrever)
    try {
      await fs.chmod(cacheFilePath, 0o600);
      log.info({ cacheFilePath, permissions: '0600' }, 'Applied restrictive permissions to OAuth cache');
    } catch (chmodError: any) {
      log.warn({ 
        cacheFilePath, 
        error: chmodError.message 
      }, 'Could not set restrictive permissions (platform may not support chmod)');
    }
    
    log.info({ userId, cacheFilePath }, 'Created yt-dlp OAuth2 cache file');
    
    return cacheFilePath;
    
  } catch (error: any) {
    log.error({ userId, error: error.message }, 'Failed to create yt-dlp OAuth cache');
    return null;
  }
}

/**
 * Limpa arquivo de cache OAuth2
 */
export async function cleanupYtDlpOAuthCache(cacheFilePath: string): Promise<void> {
  try {
    await fs.unlink(cacheFilePath);
    log.info({ cacheFilePath }, 'Cleaned up yt-dlp OAuth cache');
  } catch (error: any) {
    log.warn({ cacheFilePath, error: error.message }, 'Failed to cleanup OAuth cache');
  }
}
