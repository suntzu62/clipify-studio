import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // bytes
const TAG_LENGTH = 16; // bytes
const KEY_LENGTH = 32; // bytes (256 bits)

/**
 * Obtém a chave de criptografia do ambiente
 */
function getEncryptionKey(): Buffer {
  const keyBase64 = process.env.OAUTH_ENCRYPTION_KEY;
  if (!keyBase64) {
    throw new Error('OAUTH_ENCRYPTION_KEY not configured');
  }
  
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Invalid key length: expected ${KEY_LENGTH} bytes, got ${key.length}`);
  }
  
  return key;
}

/**
 * Criptografa um token usando AES-256-GCM
 * 
 * @param plaintext - Token em texto puro
 * @returns String base64 no formato: iv.ciphertext.tag
 */
export function encryptToken(plaintext: string): string {
  if (!plaintext) return '';
  
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  let ciphertext = cipher.update(plaintext, 'utf8');
  ciphertext = Buffer.concat([ciphertext, cipher.final()]);
  const tag = cipher.getAuthTag();
  
  // Formato: iv.ciphertext.tag (todos em base64)
  const ivBase64 = iv.toString('base64');
  const ciphertextBase64 = ciphertext.toString('base64');
  const tagBase64 = tag.toString('base64');
  
  return `${ivBase64}.${ciphertextBase64}.${tagBase64}`;
}

/**
 * Descriptografa um token criptografado com AES-256-GCM
 * 
 * @param encrypted - String no formato: iv.ciphertext.tag (base64)
 * @returns Token em texto puro
 */
export function decryptToken(encrypted: string): string {
  if (!encrypted) return '';
  
  const parts = encrypted.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format (expected: iv.ciphertext.tag)');
  }
  
  const [ivBase64, ciphertextBase64, tagBase64] = parts;
  
  const key = getEncryptionKey();
  const iv = Buffer.from(ivBase64, 'base64');
  const ciphertext = Buffer.from(ciphertextBase64, 'base64');
  const tag = Buffer.from(tagBase64, 'base64');
  
  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`);
  }
  if (tag.length !== TAG_LENGTH) {
    throw new Error(`Invalid tag length: expected ${TAG_LENGTH}, got ${tag.length}`);
  }
  
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  
  try {
    let plaintext = decipher.update(ciphertext);
    plaintext = Buffer.concat([plaintext, decipher.final()]);
    return plaintext.toString('utf8');
  } catch (err: any) {
    throw new Error(`Decryption failed: ${err.message} (wrong key or corrupted data)`);
  }
}
