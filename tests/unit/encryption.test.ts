import { describe, expect, test } from 'bun:test';
import { Encryption } from '../../src/lib/encryption';

describe('Encryption', () => {
  const enc = new Encryption('X'.repeat(32));

  test('roundtrips string', () => {
    const secret = 'sk-live-123';
    const cipher = enc.encrypt(secret);
    expect(typeof cipher).toBe('string');
    const plain = enc.decrypt<string>(cipher);
    expect(plain).toBe(secret);
  });

  test('roundtrips object', () => {
    const obj = { a: 1, b: 'two', c: { d: true } };
    const cipher = enc.encrypt(obj);
    const plain = enc.decrypt<typeof obj>(cipher);
    expect(plain).toEqual(obj);
  });
});

