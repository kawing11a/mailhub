import { SignJWT, jwtVerify } from 'jose';
import type { JWTPayload } from './types';

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is required');
  return new TextEncoder().encode(secret);
}

function getExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN || '7d';
}

export async function createToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(getExpiresIn())
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, getSecret());
  return {
    userId: payload.userId as string,
    organizationId: payload.organizationId as string,
    role: payload.role as 'admin' | 'member',
  };
}
