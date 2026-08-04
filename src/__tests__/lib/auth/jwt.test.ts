import { createToken, createRefreshToken, verifyToken, verifyRefreshToken } from '@/lib/auth/jwt';

describe('jwt token & refresh token', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256';
    process.env.JWT_EXPIRES_IN = '7d';
  });

  it('creates and verifies a 7-day access token', async () => {
    const payload = { userId: '123', organizationId: '456', role: 'admin' as const };
    const token = await createToken(payload);
    expect(typeof token).toBe('string');

    const verified = await verifyToken(token);
    expect(verified.userId).toBe('123');
    expect(verified.organizationId).toBe('456');
    expect(verified.role).toBe('admin');
  });

  it('creates and verifies a 30-day refresh token', async () => {
    const payload = { userId: '123', organizationId: '456', role: 'member' as const };
    const refreshToken = await createRefreshToken(payload);
    expect(typeof refreshToken).toBe('string');

    const verified = await verifyRefreshToken(refreshToken);
    expect(verified.userId).toBe('123');
    expect(verified.organizationId).toBe('456');
    expect(verified.role).toBe('member');
  });

  it('rejects an invalid token', async () => {
    await expect(verifyToken('invalid-token')).rejects.toThrow();
    await expect(verifyRefreshToken('invalid-token')).rejects.toThrow();
  });

  it('rejects a tampered token', async () => {
    const payload = { userId: '123', organizationId: '456', role: 'member' as const };
    const token = await createToken(payload);
    const tampered = token.slice(0, -5) + 'xxxxx';
    await expect(verifyToken(tampered)).rejects.toThrow();
  });
});
