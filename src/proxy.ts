import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// Helper to get secret for Edge runtime
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

// Protected routes (dashboard)
const protectedPaths = ['/inbox', '/labels', '/settings'];
// Auth routes
const authPaths = ['/login', '/register'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Check if path is protected or auth
  const isProtectedPath = protectedPaths.some(p => pathname.startsWith(p)) || pathname === '/';
  const isAuthPath = authPaths.some(p => pathname.startsWith(p));
  
  if (!isProtectedPath && !isAuthPath) {
    return NextResponse.next();
  }

  const token = request.cookies.get('auth-token')?.value;
  const refreshToken = request.cookies.get('refresh-token')?.value;

  // Try to verify access token first
  let isValid = false;
  if (token) {
    try {
      await jwtVerify(token, getSecret());
      isValid = true;
    } catch {
      isValid = false;
    }
  }

  // If access token expired, check refresh token
  if (!isValid && refreshToken) {
    try {
      await jwtVerify(refreshToken, getRefreshSecret());
      isValid = true;
    } catch {
      isValid = false;
    }
  }

  // Handle protected paths
  if (isProtectedPath) {
    if (!isValid) {
      const url = new URL('/login', request.url);
      if (pathname !== '/') {
        url.searchParams.set('callbackUrl', encodeURI(pathname));
      }
      return NextResponse.redirect(url);
    } else if (pathname === '/') {
       return NextResponse.redirect(new URL('/inbox', request.url));
    }
  }

  // Handle auth paths (if already logged in, redirect to inbox)
  if (isAuthPath) {
    if (isValid) {
      return NextResponse.redirect(new URL('/inbox', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
