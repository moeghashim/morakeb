import { describe, it, expect } from 'bun:test';
import { Encryption } from '../../src/lib/encryption';
import { randomBytes } from 'node:crypto';

function deriveLegacyKey(masterKey: string, salt: Uint8Array): Uint8Array {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(masterKey);
  const derivedKey = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    derivedKey[i] = keyData[i % keyData.length] ^ salt[i % salt.length];
  }
  return derivedKey;
}

function xorCipher(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ key[i % key.length] ^ iv[i % iv.length];
  }
  return out;
}

describe('Encryption legacy', () => {
  it('decrypts legacy format', () => {
    const masterKey = 'legacy-test-key-0123456789abcdef0123456789abcdef';
    const enc = new Encryption(masterKey);
    const payload = { a: 1, b: 'two' };
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));

    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = deriveLegacyKey(masterKey, salt);
    const encrypted = xorCipher(plaintext, key, iv);

    const combined = Buffer.concat([Buffer.from(salt), Buffer.from(iv), Buffer.from(encrypted)]);
    const legacy = combined.toString('base64');

    const out = enc.decrypt<typeof payload>(legacy);
    expect(out).toEqual(payload);
  });
});
