import { prisma } from '@/lib/db/prisma';
import { encrypt, decrypt } from '@/lib/crypto';

/**
 * Retrieves a valid OAuth access token for a given account ID (Gmail or Outlook/Microsoft).
 * Automatically refreshes the token using the refresh token if it is expired or near expiration.
 */
export async function getValidOAuthAccessToken(accountId: string): Promise<string> {
  const account = await prisma.emailAccount.findUnique({
    where: { id: accountId },
  });

  if (!account || !account.oauthAccessToken) {
    throw new Error(`Account ${accountId} does not have an OAuth access token.`);
  }

  const now = new Date();

  // If token is still valid (1 minute buffer), return decrypted token
  if (account.oauthTokenExpiry && account.oauthTokenExpiry > new Date(now.getTime() + 60000)) {
    return decrypt(account.oauthAccessToken);
  }

  // Token expired, refresh it
  if (!account.oauthRefreshToken) {
    throw new Error(`Account ${accountId} access token is expired and has no refresh token.`);
  }

  const refreshToken = decrypt(account.oauthRefreshToken);
  const isMicrosoft = account.oauthProvider === 'microsoft' || account.provider === 'outlook';

  const tokenUrl = isMicrosoft
    ? 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
    : 'https://oauth2.googleapis.com/token';

  const clientId = isMicrosoft
    ? process.env.MICROSOFT_CLIENT_ID || ''
    : process.env.GOOGLE_CLIENT_ID || '';

  const clientSecret = isMicrosoft
    ? process.env.MICROSOFT_CLIENT_SECRET || ''
    : process.env.GOOGLE_CLIENT_SECRET || '';

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Failed to refresh ${isMicrosoft ? 'Microsoft' : 'Google'} OAuth token: ${errorText}`);
  }

  const data = await res.json();
  const newAccessToken = data.access_token;
  const newExpiry = new Date(Date.now() + (data.expires_in * 1000));

  const updateData: any = {
    oauthAccessToken: encrypt(newAccessToken),
    oauthTokenExpiry: newExpiry,
  };

  if (data.refresh_token) {
    updateData.oauthRefreshToken = encrypt(data.refresh_token);
  }

  await prisma.emailAccount.update({
    where: { id: accountId },
    data: updateData,
  });

  return newAccessToken;
}
