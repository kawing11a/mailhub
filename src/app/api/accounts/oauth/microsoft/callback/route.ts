import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { encrypt } from '@/lib/crypto';
import { verifyToken } from '@/lib/auth/jwt';
import { createOwnedAccount } from '@/lib/accounts/service';

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

function normalizeMicrosoftEmail(profile: unknown): string | null {
  if (!profile || typeof profile !== 'object') return null;

  const { mail, userPrincipalName } = profile as {
    mail?: unknown;
    userPrincipalName?: unknown;
  };
  const providerEmail = [mail, userPrincipalName].find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );

  return providerEmail ? providerEmail.trim().toLowerCase() : null;
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
    let state: { label: string; organizationId: string };
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

    if (typeof tokens.access_token !== 'string' || !tokens.access_token) {
      return NextResponse.redirect(
        new URL('/settings/accounts?error=provider_identity_unconfirmed', baseUrl)
      );
    }

    let profileResponse: Response;
    try {
      profileResponse = await fetch(
        'https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName',
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        }
      );
    } catch (error) {
      console.error('Microsoft Graph identity lookup failed:', error);
      return NextResponse.redirect(
        new URL('/settings/accounts?error=provider_identity_unconfirmed', baseUrl)
      );
    }

    if (!profileResponse.ok) {
      console.error('Microsoft Graph identity lookup failed:', profileResponse.status);
      return NextResponse.redirect(
        new URL('/settings/accounts?error=provider_identity_unconfirmed', baseUrl)
      );
    }

    let profile: unknown;
    try {
      profile = await profileResponse.json();
    } catch (error) {
      console.error('Microsoft Graph identity response was invalid:', error);
      return NextResponse.redirect(
        new URL('/settings/accounts?error=provider_identity_unconfirmed', baseUrl)
      );
    }

    const emailAddress = normalizeMicrosoftEmail(profile);
    if (!emailAddress) {
      return NextResponse.redirect(
        new URL('/settings/accounts?error=provider_identity_unconfirmed', baseUrl)
      );
    }

    const existingAccount = await prisma.emailAccount.findFirst({
      where: {
        organizationId: auth.organizationId,
        emailAddress: { equals: emailAddress, mode: 'insensitive' },
      },
    }) as ExistingOwnedAccount | null;

    if (existingAccount && !canReauthorizeExistingAccount(auth, existingAccount.ownerUserId)) {
      return NextResponse.redirect(
        new URL('/settings/accounts?error=unauthorized_reauthorization', baseUrl)
      );
    }

    // Encrypt the tokens before storing
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
        provider: 'outlook',
        color: ACCOUNT_COLORS[accountCount % ACCOUNT_COLORS.length],
        avatarInitials: getInitials(state.label),
        imapHost: 'outlook.office365.com',
        imapPort: 993,
        smtpHost: 'smtp-mail.outlook.com',
        smtpPort: 587,
        passwordEncrypted: null,
        oauthProvider: 'microsoft',
        oauthAccessToken: encryptedAccessToken,
        oauthRefreshToken: encryptedRefreshToken,
        oauthTokenExpiry: expiry,
        workerPartition: accountCount % 2 === 0 ? 'worker-1' : 'worker-2',
      });
    }

    // Connection initialization happens asynchronously inside the worker process
    // Enqueue initial sync job
    const { syncQueue } = await import('@/lib/queue/client');
    await syncQueue.add('initial-sync', { accountId: account.id, folder: 'ALL' });

    if (existingAccount) {
      return NextResponse.redirect(
        new URL(`/settings/accounts?success=true&accountId=${account.id}`, baseUrl)
      );
    }

    return NextResponse.redirect(
      new URL(`/settings/accounts?success=true&accountId=${account.id}&share=1`, baseUrl)
    );
  } catch (error: any) {
    console.error('Microsoft OAuth error:', error);
    return NextResponse.redirect(new URL('/settings/accounts?error=internal_error', baseUrl));
  }
}
