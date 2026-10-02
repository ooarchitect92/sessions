import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const { applyTokenBundle } = useAuth();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';
  const [email, setEmail] = useState('');
  const [developmentToken, setDevelopmentToken] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>(
    token ? 'loading' : 'idle',
  );
  const [message, setMessage] = useState(
    token ? 'Verifying your address…' : 'Request a new verification message.',
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api
      .verifyEmail(token)
      .then(async (bundle) => {
        if (cancelled) return;
        await applyTokenBundle(bundle);
        setState('success');
        setMessage('Your email is verified. Opening the workspace…');
        window.setTimeout(() => navigate('/', { replace: true }), 500);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setState('error');
        setMessage(caught instanceof Error ? caught.message : 'Verification failed');
      });
    return () => {
      cancelled = true;
    };
  }, [applyTokenBundle, navigate, token]);

  const requestVerification = async (event: FormEvent) => {
    event.preventDefault();
    setRequesting(true);
    setState('loading');
    setMessage('Queueing a verification message…');
    setDevelopmentToken(null);
    try {
      const result = await api.requestEmailVerification(email);
      setDevelopmentToken(result.developmentVerificationToken ?? null);
      setState('success');
      setMessage('If the account needs verification, a message has been queued.');
    } catch (caught: unknown) {
      setState('error');
      setMessage(caught instanceof Error ? caught.message : 'The request failed');
    } finally {
      setRequesting(false);
    }
  };

  if (!token) {
    return (
      <main className="auth-page single-auth-page">
        <section className="auth-card-wrap">
          <form className="auth-card" onSubmit={requestVerification}>
            <Link className="auth-wordmark dark-wordmark" to="/">
              <span>S</span>
              Sessions
            </Link>
            <span className="auth-kicker">Email verification</span>
            <h2>Request a new verification link</h2>
            <p>
              For privacy, this response is identical whether or not the address belongs to an
              unverified account.
            </p>
            <label>
              Email address
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
              />
            </label>
            {state !== 'idle' ? (
              <div className={state === 'error' ? 'auth-error' : 'auth-note'}>{message}</div>
            ) : null}
            {developmentToken ? (
              <Link
                className="auth-primary-button anchor-button"
                to={`/auth/verify-email?token=${encodeURIComponent(developmentToken)}`}
              >
                Verify development account
              </Link>
            ) : null}
            <button className="auth-primary-button" disabled={requesting || !email}>
              {requesting ? 'Requesting…' : 'Send verification message'}
            </button>
            <Link to="/auth/login">Return to sign in</Link>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page single-auth-page">
      <section className="auth-card-wrap">
        <div className="auth-card auth-success-card">
          <span className={state === 'error' ? 'auth-error-mark' : 'auth-success-mark'}>
            {state === 'loading' ? '…' : state === 'success' ? '✓' : '!'}
          </span>
          <h2>{state === 'success' ? 'Email verified' : 'Email verification'}</h2>
          <p>{message}</p>
          {state === 'error' ? (
            <div className="auth-links centered-auth-links">
              <Link to="/auth/verify-email">Request a new link</Link>
              <Link to="/auth/login">Return to sign in</Link>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
