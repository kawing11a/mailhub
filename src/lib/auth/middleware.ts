import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from './jwt';
import type { JWTPayload } from './types';

export async function authenticate(
  req: NextRequest
): Promise<JWTPayload | NextResponse> {
  // Check HTTP-only cookie first, then Authorization header
  const token =
    req.cookies.get('auth-token')?.value ||
    req.headers.get('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    return await verifyToken(token);
  } catch {
    return NextResponse.json(
      { error: 'Invalid or expired token' },
      { status: 401 }
    );
  }
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
