import { FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const initialToken = searchParams.get('token') ?? '';
  const [token, setToken] = useState(initialToken);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [developmentToken, setDevelopmentToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      if (!token) {
        const result = await api.requestPasswordReset(email);
        setDevelopmentToken(result.developmentResetToken ?? null);
        setMessage('If this account exists, a reset message has been queued.');
      } else {
        await api.resetPassword(token, password);
        setMessage('Password updated. Existing login sessions were revoked.');
      }
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Password reset failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page single-auth-page">
      <section className="auth-card-wrap">
        <form className="auth-card" onSubmit={submit}>
          <Link className="auth-wordmark dark-wordmark" to="/">
            <span>S</span>
            Sessions
          </Link>
          <span className="auth-kicker">Account recovery</span>
          <h2>{token ? 'Choose a new password' : 'Reset your password'}</h2>
          {token ? (
            <label>
              New strong password
              <input
                required
                minLength={12}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
              />
            </label>
          ) : (
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
          )}
          {message ? <div className="auth-note">{message}</div> : null}
          {developmentToken ? (
            <button
              type="button"
              className="auth-link-button"
              onClick={() => {
                setToken(developmentToken);
                setMessage(null);
              }}
            >
              Use development reset token
            </button>
          ) : null}
          {error ? <div className="auth-error">{error}</div> : null}
          <button
            className="auth-primary-button"
            disabled={submitting || (token ? password.length < 12 : !email)}
          >
            {submitting ? 'Processing…' : token ? 'Update password' : 'Send reset message'}
          </button>
          <Link to="/auth/login">Return to sign in</Link>
        </form>
      </section>
    </main>
  );
}
