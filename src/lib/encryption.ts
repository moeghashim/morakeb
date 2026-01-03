/**
 * Encryption module for securing notification channel credentials
 * Uses AES-256-GCM with PBKDF2 key derivation
 */

import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM standard IV length
const SALT_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const PBKDF2_ITERATIONS = 210000;
const FORMAT_PREFIX = 'v1:';

export class Encryption {
  private masterKey: string;

  constructor(masterKey?: string) {
    this.masterKey = masterKey || process.env.ENCRYPTION_KEY || '';

    if (!this.masterKey) {
      throw new Error('ENCRYPTION_KEY is required');
    }
    if (this.masterKey.length < 32) {
      throw new Error('ENCRYPTION_KEY must be at least 32 characters long');
    }
  }

  /**
   * Encrypts a JSON object
   */
  encrypt<T>(data: T): string {
    const plaintext = JSON.stringify(data);

    // Generate random IV and salt
    const iv = randomBytes(IV_LENGTH);
    const salt = randomBytes(SALT_LENGTH);

    // Derive key from master key and salt
    const key = this.deriveKey(salt);

    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    // Combine: version + salt + iv + tag + ciphertext
    const combined = Buffer.concat([
      Buffer.from([1]),
      salt,
      iv,
      tag,
      ciphertext,
    ]);

    // Return as base64 with version prefix
    return `${FORMAT_PREFIX}${combined.toString('base64')}`;
  }

  /**
   * Decrypts an encrypted string back to JSON
   */
  decrypt<T = unknown>(encryptedData: string): T {
    if (!encryptedData) {
      throw new Error('Encrypted data is empty');
    }

    if (encryptedData.startsWith(FORMAT_PREFIX)) {
      return this.decryptV1(encryptedData.slice(FORMAT_PREFIX.length));
    }

    // Legacy fallback for old stored values (pre-v1 format)
    return this.decryptLegacy(encryptedData);
  }

  private deriveKey(salt: Uint8Array): Buffer {
    return pbkdf2Sync(
      this.masterKey,
      salt,
      PBKDF2_ITERATIONS,
      KEY_LENGTH,
      'sha256'
    );
  }

  private decryptV1<T>(payloadBase64: string): T {
    const combined = Buffer.from(payloadBase64, 'base64');
    if (combined.length < 1 + SALT_LENGTH + IV_LENGTH + TAG_LENGTH) {
      throw new Error('Encrypted data is too short');
    }

    const version = combined[0];
    if (version !== 1) {
      throw new Error(`Unsupported encryption version: ${version}`);
    }

    const saltStart = 1;
    const ivStart = saltStart + SALT_LENGTH;
    const tagStart = ivStart + IV_LENGTH;
    const dataStart = tagStart + TAG_LENGTH;

    const salt = combined.subarray(saltStart, ivStart);
    const iv = combined.subarray(ivStart, tagStart);
    const tag = combined.subarray(tagStart, dataStart);
    const ciphertext = combined.subarray(dataStart);

    const key = this.deriveKey(salt);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');

    return JSON.parse(plaintext) as T;
  }

  private decryptLegacy<T>(encryptedData: string): T {
    const combined = new Uint8Array(Buffer.from(encryptedData, 'base64'));
    if (combined.length < SALT_LENGTH + IV_LENGTH) {
      throw new Error('Legacy encrypted data is too short');
    }

    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const encrypted = combined.slice(SALT_LENGTH + IV_LENGTH);

    const key = this.deriveLegacyKey(salt);
    const decrypted = this.xorCipher(encrypted, key, iv);
    const plaintext = new TextDecoder().decode(decrypted);
    return JSON.parse(plaintext) as T;
  }

  private deriveLegacyKey(salt: Uint8Array): Uint8Array {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(this.masterKey);
    const derivedKey = new Uint8Array(KEY_LENGTH);
    for (let i = 0; i < KEY_LENGTH; i++) {
      derivedKey[i] = keyData[i % keyData.length] ^ salt[i % salt.length];
    }
    return derivedKey;
  }

  private xorCipher(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      out[i] = data[i] ^ key[i % key.length] ^ iv[i % iv.length];
    }
    return out;
  }

  /**
   * Test if encryption/decryption is working
   */
  test(): boolean {
    try {
      const testData = { test: 'data', number: 123, nested: { value: true } };
      const encrypted = this.encrypt(testData);
      const decrypted = this.decrypt(encrypted);
      
      return JSON.stringify(testData) === JSON.stringify(decrypted);
    } catch (error) {
      console.error('Encryption test failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const encryption = new Encryption();
