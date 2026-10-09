import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

export function SsoCallbackPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const grant = params.get('grant');
    const returnTo = params.get('returnTo') || '/';
    if (!grant) {
      setError('The enterprise sign-in grant is missing.');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const bundle = await api.exchangeEnterpriseSsoGrant(grant);
        if (cancelled) return;
        await auth.applyTokenBundle(bundle);
        navigate(returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/', { replace: true });
      } catch (caught: unknown) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Enterprise sign-in failed');
      }
    })();
    return () => { cancelled = true; };
  }, [auth, navigate, params]);

  return (
    <main className="auth-page">
      <section className="auth-card-wrap">
        <div className="auth-card">
          <span className="auth-kicker">Enterprise sign-in</span>
          <h2>{error ? 'Unable to complete sign-in' : 'Completing secure sign-in…'}</h2>
          <p>{error ?? 'Validating the one-time login grant and creating your workspace session.'}</p>
          {error ? <div className="auth-error">{error}</div> : null}
          {error ? <Link className="auth-primary-button" to="/auth/login">Return to sign in</Link> : null}
        </div>
      </section>
    </main>
  );
}