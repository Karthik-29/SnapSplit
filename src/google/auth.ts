// OAuth client IDs are public browser configuration; no client secret belongs
// in this browser application.
export const GOOGLE_CLIENT_ID = '329604023752-6li8g2humkk0pnqcf8lhd4nnosgooj4l.apps.googleusercontent.com';
export const GOOGLE_PICKER_API_KEY = 'AIzaSyAh1Z7RdAe4nYM6mmnc7C3LCNQfuiuKZWg';
const GOOGLE_PROJECT_NUMBER = '329604023752';
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.file';

let gsiLoaded = false;
let pickerLoaded = false;
let oauthClient: google.accounts.oauth2.TokenClient | null = null;

declare global {
  interface Window {
    google?: typeof google;
    gapi?: { load: (library: string, callback: () => void) => void };
  }
}

declare namespace google {
  namespace accounts {
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
    namespace picker {
      const ViewId: { SPREADSHEETS: string };
      const Action: { PICKED: string; CANCEL: string };
      const Response: { DOCUMENTS: string };
      const Document: { ID: string };
      class PickerBuilder {
        addView(view: string): PickerBuilder;
        setOAuthToken(token: string): PickerBuilder;
        setDeveloperKey(key: string): PickerBuilder;
        setAppId(appId: string): PickerBuilder;
        setCallback(callback: (data: any) => void): PickerBuilder;
        build(): { setVisible(visible: boolean): void };
      }
    }
  }
}

function loadGoogleScript(): Promise<void> {
  if (gsiLoaded) return Promise.resolve();

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

async function ensureOAuthClient() {
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

async function ensurePicker() {
  if (pickerLoaded) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.defer = true;
    script.onload = () => window.gapi?.load('picker', () => { pickerLoaded = true; resolve(); });
    script.onerror = () => reject(new Error('Failed to load Google Picker'));
    document.head.appendChild(script);
  });
}

export type PickedGoogleSpreadsheet = { id: string; name: string };

export async function pickGoogleSpreadsheet(token: string): Promise<PickedGoogleSpreadsheet | null> {
  if (!GOOGLE_PICKER_API_KEY) {
    throw new Error('Google Picker is not configured. Add a restricted Google Picker browser API key in src/google/auth.ts.');
  }
  await ensurePicker();
  return new Promise((resolve) => {
    const picker = new google.picker.PickerBuilder()
      .addView(google.picker.ViewId.SPREADSHEETS)
      .setOAuthToken(token)
      .setDeveloperKey(GOOGLE_PICKER_API_KEY)
      .setAppId(GOOGLE_PROJECT_NUMBER)
      .setCallback((data: any) => {
        // Picker normally exposes documents through Response.DOCUMENTS
        // (`docs`), but keep the fallback for browser/version differences.
        const documents = data[google.picker.Response.DOCUMENTS] ?? data.docs;
        const document = documents?.[0];
        const id = document?.[google.picker.Document.ID] ?? document?.id;
        if (id) {
          resolve({ id, name: document?.name ?? 'Google Sheet' });
          return;
        }
        // Picker sends non-terminal events such as "loaded" before the user
        // chooses a file. Only close the promise when the user cancels.
        if (data.action === google.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();
    picker.setVisible(true);
  });
}

export async function requestGoogleAccessToken(): Promise<{ accessToken: string; expiresAt: number }> {
  const client = await ensureOAuthClient();

  return new Promise((resolve, reject) => {
    oauthClient = window.google?.accounts?.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPES,
      callback: (response: google.accounts.oauth2.TokenResponse) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error || 'Failed to obtain access token'));
          return;
        }
        resolve({
          accessToken: response.access_token,
          expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
        });
      },
    });
    oauthClient.requestAccessToken();
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
