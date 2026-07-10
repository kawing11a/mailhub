import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { encrypt } from '@/lib/crypto';
import { verifyToken } from '@/lib/auth/jwt';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const stateStr = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.url;

    // First check if the user is authenticated via cookie
    const token = req.cookies.get('auth-token')?.value;
    if (!token) {
      return NextResponse.redirect(new URL('/login?error=auth_required', baseUrl));
    }

    // We authenticate manually here since this is a GET redirect from Google
    const auth = await verifyToken(token);

    if (error) {
      console.error('OAuth error returned from Google:', error);
      return NextResponse.redirect(new URL('/settings/accounts?error=oauth_rejected', baseUrl));
    }

    if (!code || !stateStr) {
      return NextResponse.redirect(new URL('/settings/accounts?error=missing_oauth_params', baseUrl));
    }

    // Decode the state
    let state: { emailAddress: string; label: string; organizationId: string };
    try {
      state = JSON.parse(Buffer.from(stateStr, 'base64').toString('utf8'));
    } catch (e) {
      console.error('Failed to parse OAuth state:', e);
      return NextResponse.redirect(new URL('/settings/accounts?error=invalid_state', baseUrl));
    }

    if (state.organizationId !== auth.organizationId) {
      return NextResponse.redirect(new URL('/settings/accounts?error=invalid_organization', baseUrl));
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(new URL('/settings/accounts?error=missing_server_config', baseUrl));
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL || url.origin;
    const redirectUri = `${origin}/api/accounts/oauth/google/callback`;

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('Google OAuth token exchange failed:', tokens);
      return NextResponse.redirect(new URL('/settings/accounts?error=token_exchange_failed', baseUrl));
    }

    // Optionally fetch actual user info from Google to verify email, 
    // but we'll trust the email they provided in the state for now.
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (userInfoResponse.ok) {
      const userInfo = await userInfoResponse.json();
      // If the email differs, you could update it, or enforce a match. 
      // For now, we just prefer the one from Google if available.
      if (userInfo.email) {
        state.emailAddress = userInfo.email;
      }
    }

    // Encrypt the tokens before storing
    const encryptedAccessToken = encrypt(tokens.access_token);
    const encryptedRefreshToken = tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined;

    // Expires_in is in seconds
    const expiry = new Date(Date.now() + (tokens.expires_in * 1000));

    // Check if account already exists
    const existingAccount = await prisma.emailAccount.findUnique({
      where: {
        organizationId_emailAddress: {
          organizationId: state.organizationId,
          emailAddress: state.emailAddress,
        }
      }
    });

    let account;
    if (existingAccount) {
      // Update existing account with new tokens
      account = await prisma.emailAccount.update({
        where: { id: existingAccount.id },
        data: {
          oauthAccessToken: encryptedAccessToken,
          oauthRefreshToken: encryptedRefreshToken || existingAccount.oauthRefreshToken,
          oauthTokenExpiry: expiry,
          isActive: true, // Reactivate if it was disabled
        }
      });
    } else {
      // Create new account
      account = await prisma.emailAccount.create({
        data: {
          organizationId: state.organizationId,
          label: state.label,
          emailAddress: state.emailAddress,
          provider: 'gmail',
          imapHost: 'imap.gmail.com',
          imapPort: 993,
          smtpHost: 'smtp.gmail.com',
          smtpPort: 465,
          oauthProvider: 'google',
          oauthAccessToken: encryptedAccessToken,
          oauthRefreshToken: encryptedRefreshToken,
          oauthTokenExpiry: expiry,
          workerPartition: Math.random() < 0.5 ? 'worker-1' : 'worker-2',
        },
      });
    }

    // Connection initialization happens asynchronously inside the worker process
    // Enqueue initial sync job
    const { syncQueue } = await import('@/lib/queue/client');
    await syncQueue.add('initial-sync', { accountId: account.id, folder: 'ALL' });

    // Redirect to dashboard on success
    return NextResponse.redirect(new URL('/settings/accounts?success=true', baseUrl));
  } catch (error: any) {
    console.error('Google OAuth error:', error);
    return NextResponse.redirect(new URL('/settings/accounts?error=internal_error', baseUrl));
  }
}
