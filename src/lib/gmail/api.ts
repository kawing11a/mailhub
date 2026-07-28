import { decrypt, encrypt } from '@/lib/crypto';
import { prisma } from '@/lib/db/prisma';



export class GmailApiError extends Error {
  constructor(message: string, public status?: number, public response?: any) {
    super(message);
    this.name = 'GmailApiError';
  }
}

/**
 * Enhanced fetch wrapper for Google APIs that implements
 * truncated exponential backoff for handling 429 and 5xx errors.
 */
export async function gmailFetch(url: string | URL, options?: RequestInit, maxRetries = 5): Promise<Response> {
  let retries = 0;
  const maxBackoff = 32000;

  while (true) {
    const res = await fetch(url.toString(), options);

    // Check if it's a rate limit error (429) or a 5xx server error
    if (res.status === 429 || res.status >= 500) {
      if (retries >= maxRetries) {
        return res; // Max retries reached, return the failed response
      }

      const randomMs = Math.floor(Math.random() * 1000);
      const backoffMs = Math.min((Math.pow(2, retries) * 1000) + randomMs, maxBackoff);

      // Consume the response body to avoid potential memory leaks before retrying
      await res.text().catch(() => null);

      console.log(`[Gmail API] Rate limit or server error (${res.status}). Retrying in ${backoffMs}ms... (Attempt ${retries + 1} of ${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
      retries++;
    } else {
      return res;
    }
  }
}

/**
 * Gets a valid access token for the given account.
 * Refreshes it if expired.
 */
export async function getValidAccessToken(accountId: string): Promise<string> {
  const account = await prisma.emailAccount.findUnique({
    where: { id: accountId },
  });

  if (!account || !account.oauthAccessToken) {
    throw new Error(`Account ${accountId} does not have an OAuth access token.`);
  }

  const now = new Date();

  // If token is still valid (add 1 minute buffer), return decrypted token
  if (account.oauthTokenExpiry && account.oauthTokenExpiry > new Date(now.getTime() + 60000)) {
    return decrypt(account.oauthAccessToken);
  }

  // Token expired, refresh it
  if (!account.oauthRefreshToken) {
    throw new Error(`Account ${accountId} access token expired and has no refresh token.`);
  }

  const refreshToken = decrypt(account.oauthRefreshToken);

  const res = await gmailFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    throw new GmailApiError('Failed to refresh Google OAuth token', res.status, errorData);
  }

  const data = await res.json();
  const newAccessToken = data.access_token;
  const newExpiry = new Date(Date.now() + (data.expires_in * 1000));

  // Update DB
  await prisma.emailAccount.update({
    where: { id: accountId },
    data: {
      oauthAccessToken: encrypt(newAccessToken),
      oauthTokenExpiry: newExpiry,
    },
  });

  return newAccessToken;
}

export interface GmailMessageListParams {
  maxResults?: number;
  pageToken?: string;
  q?: string;
  labelIds?: string[];
  includeSpamTrash?: boolean;
}

export interface GmailMessageListResult {
  messages: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate: number;
}

/**
 * Fetch list of message IDs.
 */
export async function fetchMessagesList(
  accessToken: string,
  params: GmailMessageListParams = {}
): Promise<GmailMessageListResult> {
  const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');

  if (params.maxResults) url.searchParams.set('maxResults', params.maxResults.toString());
  if (params.pageToken) url.searchParams.set('pageToken', params.pageToken);
  if (params.q) url.searchParams.set('q', params.q);
  if (params.includeSpamTrash) url.searchParams.set('includeSpamTrash', 'true');
  if (params.labelIds && params.labelIds.length > 0) {
    params.labelIds.forEach(id => url.searchParams.append('labelIds', id));
  }

  const res = await gmailFetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new GmailApiError('Failed to fetch messages list from Gmail', res.status, err);
  }

  const data = await res.json();
  return {
    messages: data.messages || [],
    nextPageToken: data.nextPageToken,
    resultSizeEstimate: data.resultSizeEstimate || 0,
  };
}

/**
 * Fetch a single message in raw RFC822 format.
 * Returns the decoded Buffer of the raw email.
 */
export async function fetchMessageRaw(
  accessToken: string,
  messageId: string
): Promise<Buffer> {
  const res = await gmailFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=raw`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new GmailApiError(`Failed to fetch message ${messageId} from Gmail`, res.status, err);
  }

  const data = await res.json();

  // Gmail returns raw as base64url encoded string
  const base64Str = data.raw.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64Str, 'base64');
}

/**
 * Send an email using raw RFC822 format buffer.
 */
export async function sendMessageRaw(
  accessToken: string,
  rawMessage: Buffer
): Promise<{ id: string; threadId: string; labelIds: string[] }> {
  // Base64url encode the buffer
  const base64Str = rawMessage.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const res = await gmailFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw: base64Str }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new GmailApiError('Failed to send message via Gmail', res.status, err);
  }

  return await res.json();
}

/**
 * Sync a draft email using raw RFC822 format buffer.
 */
export async function syncDraftRaw(
  accessToken: string,
  rawMessage: Buffer
): Promise<{ id: string; message: { id: string; threadId: string } }> {
  const base64Str = rawMessage.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const res = await gmailFetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message: { raw: base64Str } }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new GmailApiError('Failed to sync draft via Gmail', res.status, err);
  }

  return await res.json();
}
