import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const emailAddress = url.searchParams.get('emailAddress');
  const label = url.searchParams.get('label');

  if (!emailAddress || !label) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Encode the state to pass through the OAuth flow
  const stateData = {
    emailAddress,
    label,
    organizationId: auth.organizationId,
  };
  const state = Buffer.from(JSON.stringify(stateData)).toString('base64');

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'Google Client ID not configured on server' }, { status: 500 });
  }

  // Redirect URI must match what's in the Google Console exactly
  // For local dev, we construct it using the request's origin
  // Note: NEXT_PUBLIC_APP_URL is better, but falling back to req origin is safe
  const origin = process.env.NEXT_PUBLIC_APP_URL || url.origin;
  const redirectUri = `${origin}/api/accounts/oauth/google/callback`;

  const oauthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  oauthUrl.searchParams.set('client_id', clientId);
  oauthUrl.searchParams.set('redirect_uri', redirectUri);
  oauthUrl.searchParams.set('response_type', 'code');
  oauthUrl.searchParams.set('scope', [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://mail.google.com/' // Full access needed for IMAP syncing
  ].join(' '));
  oauthUrl.searchParams.set('access_type', 'offline');
  oauthUrl.searchParams.set('prompt', 'consent'); // Force consent to get refresh token
  oauthUrl.searchParams.set('state', state);
  
  // Optionally use login_hint if we know the user's email
  oauthUrl.searchParams.set('login_hint', emailAddress);

  return NextResponse.redirect(oauthUrl.toString());
}
