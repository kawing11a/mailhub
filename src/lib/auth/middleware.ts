import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, verifyRefreshToken, createToken, ACCESS_TOKEN_MAX_AGE } from './jwt';
import type { JWTPayload } from './types';

export async function authenticate(
  req: NextRequest
): Promise<JWTPayload | NextResponse> {
  // 1. Check access token in cookie or Authorization header
  const token =
    req.cookies.get('auth-token')?.value ||
    req.headers.get('Authorization')?.replace('Bearer ', '');

  if (token) {
    try {
      return await verifyToken(token);
    } catch {
      // Access token expired or invalid -> Fall through to refresh token verification
    }
  }

  // 2. Check refresh token fallback if access token expired/missing
  const refreshToken = req.cookies.get('refresh-token')?.value;
  if (refreshToken) {
    try {
      const payload = await verifyRefreshToken(refreshToken);
      // Auto-issue a new access token (valid 7 days)
      const newToken = await createToken(payload);

      // Store new token info on payload for response header setting if needed
      return {
        ...payload,
      };
    } catch {
      // Both tokens expired or invalid -> Require relogin
    }
  }

  return NextResponse.json(
    { error: 'Authentication required' },
    { status: 401 }
  );
}

export function requireAdmin(auth: JWTPayload): NextResponse | null {
  if (auth.role !== 'admin') {
    return NextResponse.json(
      { error: 'Admin access required' },
      { status: 403 }
    );
  }
  return null;
}

export function apiResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function apiError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
