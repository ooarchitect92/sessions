import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

export function SignUpPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [organizationSlug, setOrganizationSlug] = useState('');
  const [workspaceName, setWorkspaceName] = useState('Product Team');
  const [workspaceSlug, setWorkspaceSlug] = useState('product-team');
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.signUp({
        email,
        displayName,
        password,
        organizationName,
        organizationSlug,
        workspaceName,
        workspaceSlug,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if ('verificationRequired' in result) {
        setVerificationRequired(true);
        setVerificationToken(result.developmentVerificationToken ?? null);
        return;
      }
      await auth.applyTokenBundle(result);
      navigate('/', { replace: true });
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Account creation failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (verificationRequired) {
    return (
      <main className="auth-page single-auth-page">
        <section className="auth-card-wrap">
          <div className="auth-card auth-success-card">
            <span className="auth-success-mark">✓</span>
            <h2>Verify your email</h2>
            <p>
              The account and first workspace were created. Follow the verification message before
              signing in.
            </p>
            {verificationToken ? (
              <Link
                className="auth-primary-button anchor-button"
                to={`/auth/verify-email?token=${encodeURIComponent(verificationToken)}`}
              >
                Verify development account
              </Link>
            ) : null}
            <Link to="/auth/login">Return to sign in</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-story signup-story">
        <Link className="auth-wordmark" to="/">
          <span>S</span>
          Sessions
        </Link>
        <div>
          <span className="auth-kicker">Clean workspace foundation</span>
          <h1>Create the organization that owns the work.</h1>
          <p>
            The first account becomes the owner of a tenant-isolated organization and workspace.
            Additional members join through expiring, role-scoped invitations.
          </p>
        </div>
      </section>
      <section className="auth-card-wrap wide-auth-card-wrap">
        <form className="auth-card wide-auth-card" onSubmit={submit}>
          <span className="auth-kicker">Organization setup</span>
          <h2>Create your Sessions account</h2>
          <div className="auth-form-grid">
            <label>
              Your name
              <input
                required
                minLength={2}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                autoComplete="name"
              />
            </label>
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
            <label className="auth-grid-span">
              Strong password
              <input
                required
                minLength={12}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
              />
              <small>At least 12 characters with upper, lower, number, and symbol.</small>
            </label>
            <label>
              Organization name
              <input
                required
                minLength={2}
                value={organizationName}
                onChange={(event) => {
                  setOrganizationName(event.target.value);
                  setOrganizationSlug(slugify(event.target.value));
                }}
              />
            </label>
            <label>
              Organization slug
              <input
                required
                minLength={2}
                value={organizationSlug}
                onChange={(event) => setOrganizationSlug(slugify(event.target.value))}
              />
            </label>
            <label>
              First workspace
              <input
                required
                minLength={2}
                value={workspaceName}
                onChange={(event) => {
                  setWorkspaceName(event.target.value);
                  setWorkspaceSlug(slugify(event.target.value));
                }}
              />
            </label>
            <label>
              Workspace slug
              <input
                required
                minLength={2}
                value={workspaceSlug}
                onChange={(event) => setWorkspaceSlug(slugify(event.target.value))}
              />
            </label>
          </div>
          {error ? <div className="auth-error">{error}</div> : null}
          <button
            className="auth-primary-button"
            disabled={
              submitting ||
              !displayName ||
              !email ||
              password.length < 12 ||
              organizationSlug.length < 2 ||
              workspaceSlug.length < 2
            }
          >
            {submitting ? 'Creating secure workspace…' : 'Create organization'}
          </button>
          <div className="auth-links centered-auth-links">
            <span>Already have an account?</span>
            <Link to="/auth/login">Sign in</Link>
          </div>
        </form>
      </section>
    </main>
  );
}
