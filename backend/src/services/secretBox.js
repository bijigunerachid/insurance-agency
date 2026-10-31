import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';

/**
 * Authenticated encryption (AES-256-GCM) for small secrets stored in the database,
 * such as TOTP seeds. Format: v1.<iv>.<tag>.<ciphertext>, all base64url.
 */
export function createSecretBox(base64Key) {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) throw new Error('Encryption key must be 32 bytes');

  return {
    encrypt(plaintext) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [VERSION, iv, tag, ciphertext]
        .map((part, i) => (i === 0 ? part : part.toString('base64url')))
        .join('.');
    },

    decrypt(sealed) {
      const [version, iv, tag, ciphertext] = sealed.split('.');
      if (version !== VERSION || !iv || !tag || !ciphertext)
        throw new Error('Unknown secret format');
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    },
  };
}
