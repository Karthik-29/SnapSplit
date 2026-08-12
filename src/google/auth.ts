export type GoogleUser = {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
};

export type GoogleAuthState = {
  accessToken: string | null;
  expiresAt: number | null;
  user: GoogleUser | null;
};

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
export const isGoogleAuthConfigured = Boolean(GOOGLE_CLIENT_ID);
// The client ID is public browser configuration. It is injected by Vite from
// VITE_GOOGLE_CLIENT_ID; no client secret is used by this application.
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

let gsiLoaded = false;
let idInitialized = false;
let oauthClient: google.accounts.oauth2.TokenClient | null = null;
let signInResolver: ((user: GoogleUser) => void) | null = null;
let signInRejecter: ((reason?: any) => void) | null = null;

function parseJwt(jwt: string): Record<string, any> {
  const payload = jwt.split('.')[1];
  const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(decodeURIComponent(decoded.split('').map((c) => `%${('00' + c.charCodeAt(0).toString(16)).slice(-2)}`).join('')));
}

declare global {
  interface Window {
    google?: typeof google;
  }
}

declare namespace google {
  namespace accounts {
    namespace id {
      interface CredentialResponse {
        credential: string;
        select_by: string;
        clientId: string;
      }
      interface IdConfiguration {
        client_id: string;
        callback: (response: CredentialResponse) => void;
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
      }
      function initialize(config: IdConfiguration): void;
      function prompt(): void;
    }
    namespace oauth2 {
      interface TokenResponse {
        access_token?: string;
        expires_in?: number;
        error?: string;
      }
      interface TokenClientConfig {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
      }
      interface TokenClient {
        requestAccessToken: (options?: { prompt?: string }) => void;
      }
      function initTokenClient(config: TokenClientConfig): TokenClient;
      function revoke(token: string, callback: () => void): void;
    }
  }
}

function loadGoogleScript(): Promise<void> {
  if (gsiLoaded) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      gsiLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load Google Identity Services script'));
    document.head.appendChild(script);
  });
}

async function ensureIdClient() {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('Missing VITE_GOOGLE_CLIENT_ID environment variable. Configure the Google OAuth client ID in your Vite env settings.');
  }

  await loadGoogleScript();
  if (idInitialized) {
    return;
  }

  if (!window.google?.accounts?.id) {
    throw new Error('Google Identity Services is unavailable');
  }

  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (response) => {
      if (!response.credential) {
        signInRejecter?.(new Error('Google sign in failed')); 
        signInResolver = null;
        signInRejecter = null;
        return;
      }
      const payload = parseJwt(response.credential);
      const user: GoogleUser = {
        id: payload.sub,
        name: payload.name || 'Google User',
        email: payload.email,
        avatarUrl: payload.picture,
      };
      signInResolver?.(user);
      signInResolver = null;
      signInRejecter = null;
    },
    auto_select: false,
    cancel_on_tap_outside: true,
  });
  idInitialized = true;
}

async function ensureOAuthClient() {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('Missing VITE_GOOGLE_CLIENT_ID environment variable. Configure the Google OAuth client ID in your Vite env settings.');
  }

  await loadGoogleScript();
  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services is unavailable');
  }

  if (!oauthClient) {
    oauthClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPES,
      callback: () => {},
    });
  }

  return oauthClient;
}

export async function requestGoogleSignIn(): Promise<GoogleUser> {
  await ensureIdClient();

  return new Promise((resolve, reject) => {
    signInResolver = resolve;
    signInRejecter = reject;
    window.google?.accounts?.id.prompt();
  });
}

export async function requestGoogleAccessToken(): Promise<{ accessToken: string; expiresAt: number }> {
  const client = await ensureOAuthClient();

  return new Promise((resolve, reject) => {
    const callback = (response: google.accounts.oauth2.TokenResponse) => {
      if (response.error || !response.access_token) {
        reject(new Error(response.error || 'Failed to obtain access token'));
        return;
      }
      resolve({
        accessToken: response.access_token,
        expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
      });
    };

    oauthClient = window.google?.accounts?.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPES,
      callback,
    });
    oauthClient.requestAccessToken({ prompt: 'consent' });
  });
}

export function revokeGoogleAccessToken(token: string): Promise<void> {
  return new Promise((resolve) => {
    if (!window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    window.google.accounts.oauth2.revoke(token, () => resolve());
  });
}
