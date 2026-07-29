import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { encrypt } from '@/lib/crypto';
import { verifyToken } from '@/lib/auth/jwt';

export async function GET(req: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.url;

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const stateStr = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    // First check if the user is authenticated via cookie
    const token = req.cookies.get('auth-token')?.value;
    if (!token) {
      return NextResponse.redirect(new URL('/login?error=auth_required', baseUrl));
    }

    // We authenticate manually here since this is a GET redirect from Microsoft
    const auth = await verifyToken(token);

    if (error) {
      console.error('OAuth error returned from Microsoft:', error);
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

    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(new URL('/settings/accounts?error=missing_server_config', baseUrl));
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL || url.origin;
    const redirectUri = `${origin}/api/accounts/oauth/microsoft/callback`;

    // Exchange code for tokens
    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
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
      console.error('Microsoft OAuth token exchange failed:', JSON.stringify(tokens, null, 2));
      const errorMsg = encodeURIComponent(tokens.error_description || tokens.error || 'token_exchange_failed');
      return NextResponse.redirect(new URL(`/settings/accounts?error=${errorMsg}`, baseUrl));
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
          provider: 'outlook',
          imapHost: 'outlook.office365.com',
          imapPort: 993,
          smtpHost: 'smtp-mail.outlook.com',
          smtpPort: 587,
          oauthProvider: 'microsoft',
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
    console.error('Microsoft OAuth error:', error);
    return NextResponse.redirect(new URL('/settings/accounts?error=internal_error', baseUrl));
  }
}
