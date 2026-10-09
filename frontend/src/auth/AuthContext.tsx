import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { api, type AuthMe, type AuthTokenBundle } from '../api/client';
import {
  AuthenticationRequiredError,
  bootstrapAuthentication,
  clearAuthentication,
  storeAuthentication,
  subscribeToAuthenticationChanges,
} from './session';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'error';

interface AuthContextValue {
  status: AuthStatus;
  me: AuthMe | null;
  error: string | null;
  reload: () => Promise<void>;
  applyTokenBundle: (bundle: AuthTokenBundle) => Promise<void>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [me, setMe] = useState<AuthMe | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      await bootstrapAuthentication();
      const current = await api.authMe();
      setMe(current);
      setStatus('authenticated');
    } catch (caught: unknown) {
      setMe(null);
      if (caught instanceof AuthenticationRequiredError) {
        setStatus('anonymous');
        return;
      }
      const message = caught instanceof Error ? caught.message : 'Authentication failed';
      setError(message);
      setStatus(import.meta.env.VITE_AUTH_MODE === 'development' ? 'error' : 'anonymous');
    }
  }, []);

  useEffect(() => {
    void reload();
    return subscribeToAuthenticationChanges(() => {
      void reload();
    });
  }, [reload]);

  const applyTokenBundle = useCallback(
    async (bundle: AuthTokenBundle) => {
      storeAuthentication(bundle, false);
      await reload();
    },
    [reload],
  );

  const switchWorkspace = useCallback(
    async (workspaceId: string) => {
      const bundle = await api.switchWorkspace(workspaceId);
      storeAuthentication(bundle, false);
      await reload();
    },
    [reload],
  );

  const signOut = useCallback(async () => {
    let providerLogoutUrl: string | null = null;
    try {
      providerLogoutUrl = (await api.getEnterpriseSsoLogoutUrl()).url;
    } catch {
      // Local logout still proceeds when enterprise logout discovery is unavailable.
    }
    try {
      await api.logout();
    } catch {
      // Local credentials are cleared even when the server session is already unavailable.
    }
    clearAuthentication();
    setMe(null);
    setStatus('anonymous');
    if (providerLogoutUrl) {
      window.location.assign(providerLogoutUrl);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      me,
      error,
      reload,
      applyTokenBundle,
      switchWorkspace,
      signOut,
    }),
    [status, me, error, reload, applyTokenBundle, switchWorkspace, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
