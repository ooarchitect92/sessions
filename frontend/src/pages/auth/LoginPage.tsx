import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo =
    typeof (location.state as { from?: unknown } | null)?.from === 'string'
      ? (location.state as { from: string }).from
      : '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ssoSubmitting, setSsoSubmitting] = useState(false);

  const startSso = async () => {
    if (!workspaceSlug.trim()) {
      setError('Enter your workspace slug to continue with enterprise SSO.');
      return;
    }
    setSsoSubmitting(true);
    setError(null);
    try {
      const result = await api.startEnterpriseSso({
        workspaceSlug: workspaceSlug.trim(),
        returnTo,
      });
      window.location.assign(result.authorizationUrl);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Enterprise SSO could not be started');
      setSsoSubmitting(false);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (challengeToken) {
        const bundle = await api.completeMfa({ challengeToken, code: mfaCode });
        await auth.applyTokenBundle(bundle);
        navigate(returnTo, { replace: true });
        return;
      }
      const result = await api.login({
        email,
        password,
        ...(workspaceSlug.trim() ? { workspaceSlug: workspaceSlug.trim() } : {}),
      });
      if ('mfaRequired' in result) {
        setChallengeToken(result.challengeToken);
        return;
      }
      await auth.applyTokenBundle(result);
      navigate(returnTo, { replace: true });
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Sign in failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-story">
        <Link className="auth-wordmark" to="/">
          <span>S</span>
          Sessions
        </Link>
        <div>
          <span className="auth-kicker">Secure workspace access</span>
          <h1>Run the meeting. Keep the decisions.</h1>
          <p>
            Sign in to manage rooms, schedules, webinars, collaboration, and governed meeting
            memory from one tenant-isolated workspace.
          </p>
        </div>
        <div className="auth-assurance-grid">
          <span>Short-lived access tokens</span>
          <span>Rotating refresh sessions</span>
          <span>Optional TOTP MFA</span>
          <span>Workspace-level RBAC</span>
        </div>
      </section>

      <section className="auth-card-wrap">
        <form className="auth-card" onSubmit={submit}>
          <span className="auth-kicker">{challengeToken ? 'Second factor' : 'Welcome back'}</span>
          <h2>{challengeToken ? 'Verify your identity' : 'Sign in to Sessions'}</h2>
          <p>
            {challengeToken
              ? 'Enter the six-digit authenticator code or an unused recovery code.'
              : 'Use your workspace account. Passwords are not persisted by the browser client.'}
          </p>

          {challengeToken ? (
            <label>
              Authentication code
              <input
                required
                autoFocus
                value={mfaCode}
                onChange={(inputEvent) => setMfaCode(inputEvent.target.value)}
                placeholder="123456"
                autoComplete="one-time-code"
              />
            </label>
          ) : (
            <>
              <label>
                Email address
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(inputEvent) => setEmail(inputEvent.target.value)}
                  autoComplete="email"
                />
              </label>
              <label>
                Password
                <input
                  required
                  type="password"
                  value={password}
                  onChange={(inputEvent) => setPassword(inputEvent.target.value)}
                  autoComplete="current-password"
                />
              </label>
              <label>
                Workspace slug <small>Optional</small>
                <input
                  value={workspaceSlug}
                  onChange={(inputEvent) => setWorkspaceSlug(inputEvent.target.value)}
                  placeholder="product-team"
                />
              </label>
            </>
          )}

          {error ? <div className="auth-error">{error}</div> : null}
          {!challengeToken ? (
            <>
              <div className="auth-divider"><span>or</span></div>
              <button
                className="auth-secondary-button"
                type="button"
                disabled={ssoSubmitting || !workspaceSlug.trim()}
                onClick={() => void startSso()}
              >
                {ssoSubmitting ? 'Redirecting…' : 'Continue with enterprise SSO'}
              </button>
              <div className="auth-note">
                Enterprise sign-in uses your workspace OIDC configuration with state, nonce, and PKCE protection.
              </div>
            </>
          ) : null}
          <button
            className="auth-primary-button"
            disabled={submitting || (challengeToken ? !mfaCode.trim() : !email || !password)}
          >
            {submitting ? 'Checking…' : challengeToken ? 'Verify and continue' : 'Sign in'}
          </button>
          {challengeToken ? (
            <button
              className="auth-link-button"
              type="button"
              onClick={() => {
                setChallengeToken(null);
                setMfaCode('');
                setError(null);
              }}
            >
              Use a different account
            </button>
          ) : (
            <div className="auth-links auth-links-wrap">
              <Link to="/auth/reset-password">Forgot password?</Link>
              <Link to="/auth/verify-email">Verify email</Link>
              <Link to="/auth/signup">Create an organization</Link>
            </div>
          )}
        </form>
      </section>
    </main>
  );
}
