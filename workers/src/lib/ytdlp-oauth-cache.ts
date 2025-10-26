import { promises as fs, chmod } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import { decryptToken } from './crypto';
import pino from 'pino';

const log = pino({ name: 'ytdlp-oauth-cache' });

/**
 * Estrutura do cache OAuth2 esperada pelo plugin yt-dlp
 */
interface YtDlpOAuthCache {
  refresh_token: string;
  access_token?: string;
  token_type?: string;
  expires_at?: number; // Unix timestamp
}

/**
 * Cria arquivo de cache OAuth2 para o yt-dlp plugin
 * 
 * @param userId - ID do usuário no sistema
 * @param cacheDir - Diretório onde salvar o cache (ex: /tmp/yt-dlp-cache)
 * @returns Caminho do arquivo de cache criado
 */
export async function createYtDlpOAuthCache(
  userId: string,
  cacheDir: string = '/tmp/yt-dlp-cache'
): Promise<string | null> {
  try {
    // 1. Buscar tokens do usuário no banco
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    const { data: account, error } = await supabase
      .from('youtube_accounts')
      .select('access_token, refresh_token, expiry_date')
      .eq('user_id', userId)
      .single();
    
    if (error || !account?.refresh_token) {
      log.warn({ userId, error: error?.message }, 'No YouTube account found for user');
      return null;
    }
    
    // 2. Descriptografar tokens
    const decryptedRefreshToken = decryptToken(account.refresh_token);
    const decryptedAccessToken = account.access_token 
      ? decryptToken(account.access_token)
      : null;
    
    // 3. Criar estrutura do cache
    const cacheData: YtDlpOAuthCache = {
      refresh_token: decryptedRefreshToken,
      access_token: decryptedAccessToken || undefined,
      token_type: 'Bearer',
      expires_at: account.expiry_date 
        ? Math.floor(new Date(account.expiry_date).getTime() / 1000)
        : undefined
    };
    
    // 4. Criar diretório de cache se não existir
    await fs.mkdir(cacheDir, { recursive: true });
    
    // 5. Salvar cache em arquivo JSON
    // Usar userId no nome para isolar caches entre usuários
    const cacheFilePath = join(cacheDir, `oauth2-${userId}.json`);
    await fs.writeFile(
      cacheFilePath,
      JSON.stringify(cacheData, null, 2),
      'utf-8'
    );
    
    // Aplicar permissões restritivas (apenas owner pode ler/escrever)
    try {
      await fs.chmod(cacheFilePath, 0o600);
      log.info({ cacheFilePath, permissions: '0600' }, 'Applied restrictive permissions to OAuth cache');
    } catch (chmodError: any) {
      // Log warning mas não falha (algumas plataformas podem não suportar chmod)
      log.warn({ 
        cacheFilePath, 
        error: chmodError.message 
      }, 'Could not set restrictive permissions on OAuth cache (platform may not support chmod)');
    }
    
    log.info({ userId, cacheFilePath }, 'Created yt-dlp OAuth2 cache file');
    
    return cacheFilePath;
    
  } catch (error: any) {
    log.error({ userId, error: error.message }, 'Failed to create yt-dlp OAuth cache');
    return null;
  }
}

/**
 * Remove arquivo de cache OAuth2 após o download
 * 
 * @param cacheFilePath - Caminho do arquivo de cache
 */
export async function cleanupYtDlpOAuthCache(cacheFilePath: string): Promise<void> {
  try {
    await fs.unlink(cacheFilePath);
    log.info({ cacheFilePath }, 'Cleaned up yt-dlp OAuth cache file');
  } catch (error: any) {
    // Ignorar erro se arquivo não existir
    if (error.code !== 'ENOENT') {
      log.warn({ cacheFilePath, error: error.message }, 'Failed to cleanup OAuth cache');
    }
  }
}
