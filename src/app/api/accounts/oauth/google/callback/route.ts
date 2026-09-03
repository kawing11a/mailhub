import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { encrypt } from '@/lib/crypto';
import { verifyToken } from '@/lib/auth/jwt';
import { createOwnedAccount } from '@/lib/accounts/service';
import { normalizeEmailAddress } from '@/lib/email/addresses';

const ACCOUNT_COLORS = [
  '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B',
  '#EF4444', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

function getInitials(label: string): string {
  return label
    .split(/[\s-]+/)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 3);
}

function canReauthorizeExistingAccount(
  auth: Awaited<ReturnType<typeof verifyToken>>,
  ownerUserId: string
): boolean {
  return auth.role === 'admin' || auth.userId === ownerUserId;
}

type ExistingOwnedAccount = {
  id: string;
  emailAddress: string;
  ownerUserId: string;
  oauthRefreshToken: string | null;
};

function findExistingAccount(organizationId: string, emailAddress: string) {
  return prisma.emailAccount.findFirst({
    where: {
      organizationId,
      emailAddress: { equals: emailAddress, mode: 'insensitive' },
    },
  }) as Promise<ExistingOwnedAccount | null>;
}

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

    const requestedEmailAddress = normalizeEmailAddress(state.emailAddress);
    const initialExistingAccount = await findExistingAccount(
      auth.organizationId,
      requestedEmailAddress
    );

    if (initialExistingAccount && !canReauthorizeExistingAccount(auth, initialExistingAccount.ownerUserId)) {
      return NextResponse.redirect(
        new URL('/settings/accounts?error=unauthorized_reauthorization', baseUrl)
      );
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

    if (typeof tokens.access_token !== 'string' || !tokens.access_token) {
      return NextResponse.redirect(
        new URL('/settings/accounts?error=provider_identity_unconfirmed', baseUrl)
      );
    }

    let userInfoResponse: Response;
    try {
      userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
    } catch (error) {
      console.error('Google identity lookup failed:', error);
      return NextResponse.redirect(
        new URL('/settings/accounts?error=provider_identity_unconfirmed', baseUrl)
      );
    }

    if (!userInfoResponse.ok) {
      console.error('Google identity lookup failed:', userInfoResponse.status);
      return NextResponse.redirect(
        new URL('/settings/accounts?error=provider_identity_unconfirmed', baseUrl)
      );
    }

    let userInfo: unknown;
    try {
      userInfo = await userInfoResponse.json();
    } catch (error) {
      console.error('Google identity response was invalid:', error);
      return NextResponse.redirect(
        new URL('/settings/accounts?error=provider_identity_unconfirmed', baseUrl)
      );
    }

    const providerEmail =
      userInfo && typeof userInfo === 'object'
        ? (userInfo as { email?: unknown }).email
        : null;
    const emailAddress =
      typeof providerEmail === 'string' && providerEmail.trim().length > 0
        ? normalizeEmailAddress(providerEmail)
        : null;
    if (!emailAddress) {
      return NextResponse.redirect(
        new URL('/settings/accounts?error=provider_identity_unconfirmed', baseUrl)
      );
    }

    const existingAccount =
      initialExistingAccount
      && normalizeEmailAddress(initialExistingAccount.emailAddress) === emailAddress
        ? initialExistingAccount
        : await findExistingAccount(auth.organizationId, emailAddress);

    if (existingAccount && !canReauthorizeExistingAccount(auth, existingAccount.ownerUserId)) {
      return NextResponse.redirect(
        new URL('/settings/accounts?error=unauthorized_reauthorization', baseUrl)
      );
    }

    // Security boundary: do not encrypt/store credentials, mutate accounts,
    // or queue sync until the provider-confirmed email ownership check passes.
    const encryptedAccessToken = encrypt(tokens.access_token);
    const encryptedRefreshToken = tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined;

    // Expires_in is in seconds
    const expiry = new Date(Date.now() + (tokens.expires_in * 1000));

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
      const accountCount = await prisma.emailAccount.count({
        where: { organizationId: auth.organizationId },
      });

      account = await createOwnedAccount(auth.organizationId, auth.userId, {
        label: state.label,
        emailAddress,
        provider: 'gmail',
        color: ACCOUNT_COLORS[accountCount % ACCOUNT_COLORS.length],
        avatarInitials: getInitials(state.label),
        imapHost: 'imap.gmail.com',
        imapPort: 993,
        smtpHost: 'smtp.gmail.com',
        smtpPort: 465,
        passwordEncrypted: null,
        oauthProvider: 'google',
        oauthAccessToken: encryptedAccessToken,
        oauthRefreshToken: encryptedRefreshToken,
        oauthTokenExpiry: expiry,
        workerPartition: accountCount % 2 === 0 ? 'worker-1' : 'worker-2',
      });
    }

    // Connection initialization happens asynchronously inside the worker process
    // Enqueue initial sync job
    const { enqueueInitialSync } = await import('@/lib/queue/client');
    await enqueueInitialSync(account);

    if (existingAccount) {
      return NextResponse.redirect(
        new URL(`/settings/accounts?success=true&accountId=${account.id}`, baseUrl)
      );
    }

    return NextResponse.redirect(
      new URL(`/settings/accounts?success=true&accountId=${account.id}&share=1`, baseUrl)
    );
  } catch (error: any) {
    console.error('Google OAuth error:', error);
    return NextResponse.redirect(new URL('/settings/accounts?error=internal_error', baseUrl));
  }
}
