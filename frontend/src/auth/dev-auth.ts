const TOKEN_KEY = 'sessions.access-token';
const EXPIRY_KEY = 'sessions.access-token-expiry';

interface DevTokenResponse {
  data: {
    accessToken: string;
    expiresIn: number;
  };
}

function getConfiguredIdentity() {
  const organizationId = import.meta.env.VITE_DEV_ORGANIZATION_ID;
  const workspaceId = import.meta.env.VITE_DEV_WORKSPACE_ID;
  const userId = import.meta.env.VITE_DEV_USER_ID;
  const email = import.meta.env.VITE_DEV_USER_EMAIL;
  if (!organizationId || !workspaceId || !userId || !email) {
    throw new Error('The development identity is not configured');
  }
  return { organizationId, workspaceId, userId, email };
}

export function getAccessToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const expiresAt = Number(localStorage.getItem(EXPIRY_KEY) ?? '0');
  if (!token || Date.now() >= expiresAt - 30_000) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRY_KEY);
    return null;
  }
  return token;
}

export async function bootstrapAuthentication(): Promise<string> {
  const existing = getAccessToken();
  if (existing) return existing;

  if (import.meta.env.VITE_AUTH_MODE !== 'development') {
    throw new Error('Production OIDC authentication is not configured yet');
  }

  const identity = getConfiguredIdentity();
  const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/dev-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...identity,
      displayName: 'Local Owner',
      roles: ['OWNER'],
    }),
  });
  if (!response.ok) {
    throw new Error(`Development sign-in failed (${response.status})`);
  }
  const payload = (await response.json()) as DevTokenResponse;
  localStorage.setItem(TOKEN_KEY, payload.data.accessToken);
  localStorage.setItem(
    EXPIRY_KEY,
    String(Date.now() + payload.data.expiresIn * 1000),
  );
  return payload.data.accessToken;
}

export function clearAuthentication(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRY_KEY);
}
