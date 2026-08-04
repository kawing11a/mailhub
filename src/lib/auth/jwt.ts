import { SignJWT, jwtVerify } from 'jose';
import type { JWTPayload } from './types';

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is required');
  return new TextEncoder().encode(secret);
}

function getRefreshSecret(): Uint8Array {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is required');
  return new TextEncoder().encode(`${secret}_refresh`);
}

export const ACCESS_TOKEN_EXPIRY = '7d';
export const REFRESH_TOKEN_EXPIRY = '30d';
export const ACCESS_TOKEN_MAX_AGE = 60 * 60 * 24 * 7;   // 7 days in seconds
export const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 30; // 30 days (1 month) in seconds

function getExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN || ACCESS_TOKEN_EXPIRY;
}

export async function createToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload, type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(getExpiresIn())
    .sign(getSecret());
}

export async function createRefreshToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .sign(getRefreshSecret());
}

export async function verifyToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, getSecret());
  return {
    userId: payload.userId as string,
    organizationId: payload.organizationId as string,
    role: payload.role as 'admin' | 'member',
  };
}

export async function verifyRefreshToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, getRefreshSecret());
  return {
    userId: payload.userId as string,
    organizationId: payload.organizationId as string,
    role: payload.role as 'admin' | 'member',
  };
}
