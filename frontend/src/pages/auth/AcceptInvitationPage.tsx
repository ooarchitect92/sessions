import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

export function AcceptInvitationPage() {
  const [searchParams] = useSearchParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = challengeToken
        ? await api.completeMfa({ challengeToken, code: mfaCode })
        : await api.acceptInvitation({
            token,
            ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
            password,
          });
      if ('mfaRequired' in result) {
        setChallengeToken(result.challengeToken);
        setPassword('');
        return;
      }
      await auth.applyTokenBundle(result);
      navigate('/', { replace: true });
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Invitation acceptance failed');
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
          <span className="auth-kicker">Workspace invitation</span>
          <h2>Join the team</h2>
          <p>
            Existing users enter their account password. New users also provide a display name and
            create a strong password.
          </p>
          {challengeToken ? (
            <label>
              Authenticator or recovery code
              <input
                autoFocus
                required
                minLength={6}
                maxLength={32}
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value)}
                autoComplete="one-time-code"
              />
            </label>
          ) : (
            <>
              <label>
                Display name <small>Required for new accounts</small>
                <input
                  minLength={2}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  autoComplete="name"
                />
              </label>
              <label>
                Account password
                <input
                  required
                  minLength={12}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </label>
            </>
          )}
          {!token ? <div className="auth-error">The invitation token is missing.</div> : null}
          {error ? <div className="auth-error">{error}</div> : null}
          <button
            className="auth-primary-button"
            disabled={
              submitting ||
              !token ||
              (challengeToken ? mfaCode.length < 6 : password.length < 12)
            }
          >
            {submitting
              ? challengeToken
                ? 'Verifying…'
                : 'Joining…'
              : challengeToken
                ? 'Verify and continue'
                : 'Accept invitation'}
          </button>
          <Link to="/auth/login">Return to sign in</Link>
        </form>
      </section>
    </main>
  );
}
