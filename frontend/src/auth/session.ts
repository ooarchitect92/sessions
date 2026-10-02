const ACCESS_TOKEN_KEY = 'sessions.access-token';
const ACCESS_TOKEN_EXPIRY_KEY = 'sessions.access-token-expiry';
const REFRESH_TOKEN_KEY = 'sessions.refresh-token';
const REFRESH_TOKEN_EXPIRY_KEY = 'sessions.refresh-token-expiry';
const AUTH_CHANGED_EVENT = 'sessions:authentication-changed';

interface ApiEnvelope<T> {
  data: T;
}

export interface StoredTokenBundle {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export class AuthenticationRequiredError extends Error {
  constructor(message = 'Sign in to continue') {
    super(message);
    this.name = 'AuthenticationRequiredError';
  }
}

let refreshPromise: Promise<string> | null = null;

function notifyAuthenticationChanged(): void {
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

function getConfiguredDevelopmentIdentity() {
  const organizationId = import.meta.env.VITE_DEV_ORGANIZATION_ID;
  const workspaceId = import.meta.env.VITE_DEV_WORKSPACE_ID;
  const userId = import.meta.env.VITE_DEV_USER_ID;
  const email = import.meta.env.VITE_DEV_USER_EMAIL;
  if (!organizationId || !workspaceId || !userId || !email) {
    throw new Error('The development identity is not configured');
  }
  return { organizationId, workspaceId, userId, email };
}

function unexpired(key: string): boolean {
  const expiresAt = Date.parse(localStorage.getItem(key) ?? '');
  return Number.isFinite(expiresAt) && Date.now() < expiresAt - 30_000;
}

export function getAccessToken(): string | null {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  const expiresAt = Number(localStorage.getItem(ACCESS_TOKEN_EXPIRY_KEY) ?? '0');
  if (!token || Date.now() >= expiresAt - 30_000) {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(ACCESS_TOKEN_EXPIRY_KEY);
    return null;
  }
  return token;
}

export function getRefreshToken(): string | null {
  const token = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!token || !unexpired(REFRESH_TOKEN_EXPIRY_KEY)) {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_EXPIRY_KEY);
    return null;
  }
  return token;
}

export function storeAuthentication(
  bundle: StoredTokenBundle,
  notify = true,
): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, bundle.accessToken);
  localStorage.setItem(
    ACCESS_TOKEN_EXPIRY_KEY,
    String(Date.now() + bundle.accessTokenExpiresIn * 1000),
  );
  localStorage.setItem(REFRESH_TOKEN_KEY, bundle.refreshToken);
  localStorage.setItem(REFRESH_TOKEN_EXPIRY_KEY, bundle.refreshTokenExpiresAt);
  if (notify) notifyAuthenticationChanged();
}

export function clearAuthentication(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(ACCESS_TOKEN_EXPIRY_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_EXPIRY_KEY);
  notifyAuthenticationChanged();
}

async function parseData<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<T>
    | { error?: { message?: string } }
    | null;
  if (!response.ok) {
    const message =
      payload && 'error' in payload
        ? payload.error?.message ?? `Authentication failed (${response.status})`
        : `Authentication failed (${response.status})`;
    throw new Error(message);
  }
  if (!payload || !('data' in payload)) {
    throw new Error('The authentication service returned an invalid response');
  }
  return payload.data;
}

async function bootstrapDevelopmentToken(): Promise<string> {
  const identity = getConfiguredDevelopmentIdentity();
  const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/dev-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...identity,
      displayName: 'Local Owner',
      roles: ['OWNER'],
    }),
  });
  const result = await parseData<StoredTokenBundle>(response);
  storeAuthentication(result);
  return result.accessToken;
}

export async function refreshAuthentication(): Promise<string> {
  if (refreshPromise) return refreshPromise;
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new AuthenticationRequiredError();

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-request-id': crypto.randomUUID(),
        },
        body: JSON.stringify({ refreshToken }),
      });
      const result = await parseData<StoredTokenBundle>(response);
      storeAuthentication(result);
      return result.accessToken;
    } catch (error) {
      clearAuthentication();
      throw error;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function bootstrapAuthentication(): Promise<string> {
  const accessToken = getAccessToken();
  if (accessToken) return accessToken;

  if (getRefreshToken()) {
    return refreshAuthentication();
  }
  if (import.meta.env.VITE_AUTH_MODE === 'development') {
    return bootstrapDevelopmentToken();
  }
  throw new AuthenticationRequiredError();
}

export function subscribeToAuthenticationChanges(listener: () => void): () => void {
  window.addEventListener(AUTH_CHANGED_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(AUTH_CHANGED_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}
