import { encrypt, decrypt } from '@/lib/crypto';

describe('crypto', () => {
  const originalEnv = process.env;

  beforeAll(() => {
    // 64-char hex string = 32 bytes for AES-256
    process.env.ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('encrypts and decrypts a string correctly', () => {
    const plaintext = 'my-secret-password';
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext (random IV)', () => {
    const plaintext = 'same-input';
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a).not.toBe(b);
  });

  it('encrypted format is iv:authTag:ciphertext (hex)', () => {
    const encrypted = encrypt('test');
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(3);
    // IV = 12 bytes = 24 hex chars
    expect(parts[0]).toHaveLength(24);
    // Auth tag = 16 bytes = 32 hex chars
    expect(parts[1]).toHaveLength(32);
    // Ciphertext is non-empty hex
    expect(parts[2].length).toBeGreaterThan(0);
  });

  it('throws on tampered ciphertext', () => {
    const encrypted = encrypt('test');
    const parts = encrypted.split(':');
    // Tamper with ciphertext by flipping first byte
    const firstByteFlipped = (parseInt(parts[2].slice(0, 2), 16) ^ 0xff)
      .toString(16)
      .padStart(2, '0');
    const tampered = `${parts[0]}:${parts[1]}:${firstByteFlipped}${parts[2].slice(2)}`;
    expect(() => decrypt(tampered)).toThrow();
  });
});
