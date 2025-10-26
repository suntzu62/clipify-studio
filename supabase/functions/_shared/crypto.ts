/**
 * Criptografia AES-256-GCM para tokens OAuth
 * Usa Web Crypto API nativa do Deno (sem dependências externas)
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // bytes (96 bits recomendado para GCM)
const TAG_LENGTH = 128; // bits (autenticação)

/**
 * Obtém a chave de criptografia do ambiente
 * Formato esperado: base64 string de 32 bytes
 */
function getEncryptionKey(): Uint8Array {
  const keyBase64 = Deno.env.get('OAUTH_ENCRYPTION_KEY');
  if (!keyBase64) {
    throw new Error('OAUTH_ENCRYPTION_KEY not configured');
  }
  
  try {
    // Decodificar de base64
    const binaryString = atob(keyBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    if (bytes.length !== 32) {
      throw new Error(`Invalid key length: expected 32 bytes, got ${bytes.length}`);
    }
    
    return bytes;
  } catch (err: any) {
    throw new Error(`Failed to decode OAUTH_ENCRYPTION_KEY: ${err.message}`);
  }
}

/**
 * Importa a chave de criptografia para uso com Web Crypto API
 */
async function importKey(): Promise<CryptoKey> {
  const keyData = getEncryptionKey();
  
  return await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: ALGORITHM, length: KEY_LENGTH },
    false, // não exportável
    ['encrypt', 'decrypt']
  );
}

/**
 * Criptografa um token usando AES-256-GCM
 * 
 * @param plaintext - Token em texto puro
 * @returns String base64 no formato: iv.ciphertext (ambos em base64)
 */
export async function encryptToken(plaintext: string): Promise<string> {
  if (!plaintext) return '';
  
  const key = await importKey();
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  
  // Gerar IV aleatório (nonce)
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  
  // Criptografar
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    key,
    data
  );
  
  // Converter para base64: iv.ciphertext
  const ivBase64 = btoa(String.fromCharCode(...iv));
  const ciphertextBase64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
  
  return `${ivBase64}.${ciphertextBase64}`;
}

/**
 * Descriptografa um token criptografado com AES-256-GCM
 * 
 * @param encrypted - String no formato: iv.ciphertext (base64)
 * @returns Token em texto puro
 */
export async function decryptToken(encrypted: string): Promise<string> {
  if (!encrypted) return '';
  
  // Parse do formato iv.ciphertext
  const parts = encrypted.split('.');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted token format (expected: iv.ciphertext)');
  }
  
  const [ivBase64, ciphertextBase64] = parts;
  
  // Decodificar de base64
  const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(ciphertextBase64), c => c.charCodeAt(0));
  
  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`);
  }
  
  const key = await importKey();
  
  // Descriptografar
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
      key,
      ciphertext
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(plaintext);
  } catch (err: any) {
    throw new Error(`Decryption failed: ${err.message} (wrong key or corrupted data)`);
  }
}

/**
 * Gera uma nova chave de criptografia AES-256 em formato base64
 * Use apenas uma vez para gerar a chave inicial, depois armazene no Supabase Secrets
 * 
 * @returns Chave em base64 (32 bytes)
 */
export async function generateEncryptionKey(): Promise<string> {
  const key = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...key));
}
