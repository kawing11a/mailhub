import { NextRequest } from 'next/server';
import {
  verifyRefreshToken,
  createToken,
  createRefreshToken,
  ACCESS_TOKEN_MAX_AGE,
  REFRESH_TOKEN_MAX_AGE,
} from '@/lib/auth/jwt';
import { apiError, apiResponse } from '@/lib/auth/middleware';

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get('refresh-token')?.value;

  if (!refreshToken) {
    return apiError('Refresh token required. Please log in again.', 401);
  }

  try {
    const payload = await verifyRefreshToken(refreshToken);
    
    // Issue fresh tokens
    const newToken = await createToken(payload);
    const newRefreshToken = await createRefreshToken(payload);

    const response = apiResponse({
      success: true,
      message: 'Token refreshed successfully',
    });

    // Access Token Cookie (7 Days)
    response.cookies.set('auth-token', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: ACCESS_TOKEN_MAX_AGE,
      path: '/',
    });

    // Refresh Token Cookie (30 Days / 1 Month)
    response.cookies.set('refresh-token', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: REFRESH_TOKEN_MAX_AGE,
      path: '/',
    });

    return response;
  } catch (err: any) {
    return apiError('Invalid or expired refresh token. Please log in again.', 401);
  }
}
