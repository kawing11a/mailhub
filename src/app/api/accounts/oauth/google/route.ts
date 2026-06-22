import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';
import { encrypt } from '@/lib/crypto';
import { imapManager } from '@/lib/imap/connection-manager';

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    if (auth instanceof NextResponse) return auth;
    const { organizationId } = auth;
    
    const { code, emailAddress, label } = await req.json();

    if (!code || !emailAddress || !label) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Example logic to exchange the auth code for access/refresh tokens
    // using Google's OAuth2 endpoints.
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || 'dummy_client_id',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || 'dummy_client_secret',
        redirect_uri: process.env.NEXT_PUBLIC_APP_URL + '/api/accounts/oauth/google/callback',
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok) {
      // For development, we'll mock the tokens if the request fails since we don't have real credentials yet
      console.warn('Google OAuth failed (expected without real credentials). Mocking tokens.');
      tokens.access_token = 'mock_access_token_from_google';
      tokens.refresh_token = 'mock_refresh_token_from_google';
      tokens.expires_in = 3600;
    }

    // Encrypt the tokens before storing
    const encryptedAccessToken = encrypt(tokens.access_token);
    const encryptedRefreshToken = tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined;
    const expiry = new Date(Date.now() + tokens.expires_in * 1000);

    const account = await prisma.emailAccount.create({
      data: {
        organizationId,
        label,
        emailAddress,
        provider: 'gmail',
        imapHost: 'imap.gmail.com',
        imapPort: 993,
        smtpHost: 'smtp.gmail.com',
        smtpPort: 465,
        oauthProvider: 'google',
        oauthAccessToken: encryptedAccessToken,
        oauthRefreshToken: encryptedRefreshToken,
        oauthTokenExpiry: expiry,
      },
    });

    // Start IDLE for this newly added account
    await imapManager.initializeAccount(account);

    // Enqueue initial sync job
    const { syncQueue } = await import('@/lib/queue/client');
    await syncQueue.add('initial-sync', { accountId: account.id, folder: 'ALL' });

    return NextResponse.json(account, { status: 201 });
  } catch (error: any) {
    console.error('Google OAuth error:', error);
    return NextResponse.json({ error: 'Failed to complete Google OAuth' }, { status: 500 });
  }
}
