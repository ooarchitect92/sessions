import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkspaceRole } from '@sessions/contracts';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  api,
  type CalendarProvider,
  type WorkspaceMember,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';

const TABS = ['workspace', 'members', 'workspaces', 'integrations', 'security'] as const;
type SettingsTab = (typeof TABS)[number];

const MEMBER_ROLES: WorkspaceRole[] = ['ADMIN', 'HOST', 'MEMBER', 'ANALYST', 'GUEST'];
const ALL_ROLES: WorkspaceRole[] = ['OWNER', ...MEMBER_ROLES];

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function formatDate(value: string | null): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab: SettingsTab = TABS.includes(requestedTab as SettingsTab)
    ? (requestedTab as SettingsTab)
    : 'workspace';

  return (
    <div className="settings-page">
      <section className="page-heading settings-heading">
        <div>
          <span className="eyebrow">Control plane</span>
          <h1>Workspace settings</h1>
          <p>
            Manage tenant identity, member access, workspace policy, login sessions, and
            multi-factor security without mixing control-plane state into live meeting flows.
          </p>
        </div>
      </section>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {TABS.map((item) => (
            <button
              type="button"
              key={item}
              className={tab === item ? 'active' : ''}
              onClick={() => setSearchParams({ tab: item })}
            >
              <span>
                {item === 'workspace'
                  ? '◇'
                  : item === 'members'
                    ? '◎'
                    : item === 'workspaces'
                      ? '▦'
                      : item === 'integrations'
                        ? '↗'
                        : '⌾'}
              </span>
              {item === 'workspace'
                ? 'Workspace profile'
                : item === 'members'
                  ? 'Members and invites'
                  : item === 'workspaces'
                    ? 'Your workspaces'
                    : item === 'integrations'
                      ? 'Integrations'
                      : 'Security'}
            </button>
          ))}
        </nav>
        <section className="settings-content">
          {tab === 'workspace' ? <WorkspaceProfile /> : null}
          {tab === 'members' ? <MembersAndInvitations /> : null}
          {tab === 'workspaces' ? <WorkspaceDirectory /> : null}
          {tab === 'integrations' ? <IntegrationSettings /> : null}
          {tab === 'security' ? <SecuritySettings /> : null}
        </section>
      </div>
    </div>
  );
}

function WorkspaceProfile() {
  const queryClient = useQueryClient();
  const workspace = useQuery({
    queryKey: ['workspace-current'],
    queryFn: () => api.getCurrentWorkspace(),
  });
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [recordingConsentRequired, setRecordingConsentRequired] = useState(true);
  const canManage = ['OWNER', 'ADMIN'].includes(workspace.data?.currentRole ?? 'GUEST');

  useEffect(() => {
    if (!workspace.data) return;
    setName(workspace.data.name);
    setSlug(workspace.data.slug);
    setTimezone(workspace.data.timezone);
    setRecordingConsentRequired(
      workspace.data.settings.recordingConsentRequired !== false,
    );
  }, [workspace.data]);

  const update = useMutation({
    mutationFn: () => {
      if (!workspace.data) throw new Error('Workspace is unavailable');
      return api.updateCurrentWorkspace(workspace.data.version, {
        name,
        slug,
        timezone,
        settings: { recordingConsentRequired },
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workspace-current'] }),
        queryClient.invalidateQueries({ queryKey: ['workspace-directory'] }),
      ]);
    },
  });

  if (workspace.isLoading) return <SettingsLoading />;
  if (workspace.error || !workspace.data) {
    return <SettingsError message={workspace.error?.message ?? 'Workspace unavailable'} />;
  }

  return (
    <div className="settings-stack">
      <section className="panel settings-panel">
        <div className="settings-panel-heading">
          <div>
            <span className="eyebrow">Current tenant boundary</span>
            <h2>Workspace profile</h2>
            <p>Names and policy are isolated to this workspace inside the organization.</p>
          </div>
          <span className="settings-role-chip">{workspace.data.currentRole.toLowerCase()}</span>
        </div>
        <form
          className="settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate();
          }}
        >
          <div className="settings-form-grid">
            <label>
              Workspace name
              <input
                disabled={!canManage}
                required
                minLength={2}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              Workspace slug
              <input
                disabled={!canManage}
                required
                minLength={2}
                value={slug}
                onChange={(event) => setSlug(toSlug(event.target.value))}
              />
            </label>
            <label className="settings-grid-span">
              IANA timezone
              <input
                disabled={!canManage}
                required
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                placeholder="Asia/Kolkata"
              />
            </label>
          </div>
          <label className="settings-toggle-row">
            <input
              disabled={!canManage}
              type="checkbox"
              checked={recordingConsentRequired}
              onChange={(event) => setRecordingConsentRequired(event.target.checked)}
            />
            <span>
              <strong>Require recording consent</strong>
              <small>
                Meeting capture workflows must preserve a consent snapshot before recording starts.
              </small>
            </span>
          </label>
          {update.error ? <div className="error-banner">{update.error.message}</div> : null}
          {update.isSuccess ? <div className="success-banner">Workspace settings saved.</div> : null}
          <div className="settings-actions">
            <button className="button primary" disabled={!canManage || update.isPending}>
              {update.isPending ? 'Saving…' : 'Save workspace'}
            </button>
          </div>
        </form>
      </section>

      <section className="settings-metric-grid">
        <MetricCard label="Members" value={workspace.data._count.memberships} />
        <MetricCard label="Rooms" value={workspace.data._count.rooms} />
        <MetricCard label="Sessions" value={workspace.data._count.sessions} />
        <MetricCard
          label="Audience workflows"
          value={workspace.data._count.events + workspace.data._count.bookingPages}
        />
      </section>
    </div>
  );
}

function MembersAndInvitations() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const members = useQuery({
    queryKey: ['workspace-members'],
    queryFn: () => api.listWorkspaceMembers(),
  });
  const currentRole = auth.me?.principal.roles[0] ?? 'GUEST';
  const canManage = ['OWNER', 'ADMIN'].includes(currentRole);
  const invitations = useQuery({
    queryKey: ['workspace-invitations'],
    queryFn: () => api.listWorkspaceInvitations(),
    enabled: canManage,
  });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('MEMBER');
  const [developmentToken, setDevelopmentToken] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: () => api.inviteWorkspaceMember(email, role),
    onSuccess: async (result) => {
      setEmail('');
      setDevelopmentToken(result.developmentInvitationToken ?? null);
      await queryClient.invalidateQueries({ queryKey: ['workspace-invitations'] });
    },
  });
  const updateRole = useMutation({
    mutationFn: ({ member, nextRole }: { member: WorkspaceMember; nextRole: WorkspaceRole }) =>
      api.updateWorkspaceMemberRole(member.id, nextRole),
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] }),
  });
  const remove = useMutation({
    mutationFn: (member: WorkspaceMember) => api.removeWorkspaceMember(member.id),
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] }),
  });
  const revoke = useMutation({
    mutationFn: (invitationId: string) => api.revokeWorkspaceInvitation(invitationId),
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: ['workspace-invitations'] }),
  });

  return (
    <div className="settings-stack">
      <section className="panel settings-panel">
        <div className="settings-panel-heading">
          <div>
            <span className="eyebrow">Role-scoped onboarding</span>
            <h2>Invite a member</h2>
            <p>Invitations expire after seven days and can be revoked or reissued.</p>
          </div>
        </div>
        <form
          className="invite-row"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            invite.mutate();
          }}
        >
          <input
            disabled={!canManage}
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="member@example.com"
          />
          <select
            disabled={!canManage}
            value={role}
            onChange={(event) => setRole(event.target.value as WorkspaceRole)}
          >
            {MEMBER_ROLES.map((item) => (
              <option key={item} value={item}>
                {item.toLowerCase()}
              </option>
            ))}
          </select>
          <button className="button primary" disabled={!canManage || invite.isPending || !email}>
            {invite.isPending ? 'Inviting…' : 'Send invitation'}
          </button>
        </form>
        {invite.error ? <div className="error-banner">{invite.error.message}</div> : null}
        {developmentToken ? (
          <div className="development-token-box">
            <div>
              <strong>Development invitation link</strong>
              <small>This token is returned only outside production.</small>
            </div>
            <code>{`${window.location.origin}/auth/invitations/accept?token=${encodeURIComponent(developmentToken)}`}</code>
          </div>
        ) : null}
      </section>

      <section className="panel settings-panel">
        <div className="settings-panel-heading compact-settings-heading">
          <div>
            <span className="eyebrow">Active access</span>
            <h2>Members</h2>
          </div>
          <span className="count-pill">{members.data?.length ?? 0}</span>
        </div>
        {members.isLoading ? <SettingsLoading /> : null}
        {members.error ? <SettingsError message={members.error.message} /> : null}
        <div className="settings-table">
          {members.data?.map((member) => (
            <div className="settings-table-row member-row" key={member.id}>
              <div className="member-avatar">{member.user.displayName.slice(0, 2).toUpperCase()}</div>
              <div className="member-copy">
                <strong>{member.user.displayName}</strong>
                <span>{member.user.email}</span>
                <small>
                  {member.user.emailVerifiedAt ? 'Verified' : 'Unverified'} ·{' '}
                  {member.user.mfaEnabled ? 'MFA enabled' : 'MFA not enabled'} · Last sign-in{' '}
                  {formatDate(member.user.lastLoginAt)}
                </small>
              </div>
              <select
                aria-label={`Role for ${member.user.displayName}`}
                disabled={!canManage || updateRole.isPending}
                value={member.role}
                onChange={(event) =>
                  updateRole.mutate({
                    member,
                    nextRole: event.target.value as WorkspaceRole,
                  })
                }
              >
                {ALL_ROLES.map((item) => (
                  <option key={item} value={item}>
                    {item.toLowerCase()}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="settings-row-action danger-text"
                disabled={!canManage || remove.isPending}
                onClick={() => {
                  if (window.confirm(`Remove ${member.user.displayName} from this workspace?`)) {
                    remove.mutate(member);
                  }
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        {updateRole.error ? <div className="error-banner">{updateRole.error.message}</div> : null}
        {remove.error ? <div className="error-banner">{remove.error.message}</div> : null}
      </section>

      <section className="panel settings-panel">
        <div className="settings-panel-heading compact-settings-heading">
          <div>
            <span className="eyebrow">Pending and historical</span>
            <h2>Invitations</h2>
          </div>
          <span className="count-pill">{invitations.data?.length ?? 0}</span>
        </div>
        {invitations.isLoading ? <SettingsLoading /> : null}
        {invitations.error ? <SettingsError message={invitations.error.message} /> : null}
        <div className="settings-table">
          {invitations.data?.map((invitation) => (
            <div className="settings-table-row invitation-row" key={invitation.id}>
              <div className="member-copy">
                <strong>{invitation.email}</strong>
                <span>
                  {invitation.role.toLowerCase()} · invited {formatDate(invitation.createdAt)}
                </span>
              </div>
              <span className={`invitation-status status-${invitation.status.toLowerCase()}`}>
                {invitation.status.toLowerCase()}
              </span>
              {invitation.status === 'PENDING' ? (
                <button
                  type="button"
                  className="settings-row-action danger-text"
                  disabled={!canManage || revoke.isPending}
                  onClick={() => revoke.mutate(invitation.id)}
                >
                  Revoke
                </button>
              ) : null}
            </div>
          ))}
          {invitations.data?.length === 0 ? (
            <div className="settings-empty-row">No invitations have been created.</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function WorkspaceDirectory() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const directory = useQuery({
    queryKey: ['workspace-directory'],
    queryFn: () => api.listWorkspaces(),
  });
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [switchError, setSwitchError] = useState<string | null>(null);
  const canCreate = auth.me?.principal.roles.some((role) =>
    ['OWNER', 'ADMIN'].includes(role),
  );

  const create = useMutation({
    mutationFn: () => api.createWorkspace({ name, slug, timezone }),
    onSuccess: async () => {
      setName('');
      setSlug('');
      await queryClient.invalidateQueries({ queryKey: ['workspace-directory'] });
      await auth.reload();
    },
  });

  const switchWorkspace = async (workspaceId: string) => {
    setSwitchError(null);
    try {
      await auth.switchWorkspace(workspaceId);
      window.location.assign('/');
    } catch (caught: unknown) {
      setSwitchError(caught instanceof Error ? caught.message : 'Workspace switch failed');
    }
  };

  return (
    <div className="settings-stack">
      <section className="panel settings-panel">
        <div className="settings-panel-heading compact-settings-heading">
          <div>
            <span className="eyebrow">Organization directory</span>
            <h2>Your workspaces</h2>
          </div>
        </div>
        {directory.isLoading ? <SettingsLoading /> : null}
        {directory.error ? <SettingsError message={directory.error.message} /> : null}
        <div className="workspace-directory-grid">
          {directory.data?.map((entry) => (
            <article className={entry.current ? 'workspace-directory-card current' : 'workspace-directory-card'} key={entry.membershipId}>
              <span>{entry.organization.name}</span>
              <h3>{entry.workspace.name}</h3>
              <p>
                {entry.workspace.memberCount} members · {entry.workspace.sessionCount} sessions ·{' '}
                {entry.role.toLowerCase()}
              </p>
              <button
                type="button"
                className={entry.current ? 'button secondary' : 'button primary'}
                disabled={entry.current}
                onClick={() => void switchWorkspace(entry.workspace.id)}
              >
                {entry.current ? 'Current workspace' : 'Open workspace'}
              </button>
            </article>
          ))}
        </div>
        {switchError ? <div className="error-banner">{switchError}</div> : null}
      </section>

      <section className="panel settings-panel">
        <div className="settings-panel-heading">
          <div>
            <span className="eyebrow">New tenant workspace</span>
            <h2>Create another workspace</h2>
            <p>New workspaces inherit the organization boundary but keep their own data and roles.</p>
          </div>
        </div>
        <form
          className="settings-form"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <div className="settings-form-grid">
            <label>
              Workspace name
              <input
                disabled={!canCreate}
                required
                minLength={2}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setSlug(toSlug(event.target.value));
                }}
              />
            </label>
            <label>
              Slug
              <input
                disabled={!canCreate}
                required
                minLength={2}
                value={slug}
                onChange={(event) => setSlug(toSlug(event.target.value))}
              />
            </label>
            <label className="settings-grid-span">
              Timezone
              <input
                disabled={!canCreate}
                required
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
              />
            </label>
          </div>
          {create.error ? <div className="error-banner">{create.error.message}</div> : null}
          <div className="settings-actions">
            <button
              className="button primary"
              disabled={!canCreate || create.isPending || name.length < 2 || slug.length < 2}
            >
              {create.isPending ? 'Creating…' : 'Create workspace'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function SecuritySettings() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const loginSessions = useQuery({
    queryKey: ['login-sessions'],
    queryFn: () => api.listLoginSessions(),
  });
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [mfaSetup, setMfaSetup] = useState<{
    secret: string;
    otpauthUri: string;
    recoveryCodes: string[];
  } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [disableCode, setDisableCode] = useState('');

  const password = useMutation({
    mutationFn: () => api.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
    },
  });
  const setupMfa = useMutation({
    mutationFn: () => api.setupMfa(),
    onSuccess: setMfaSetup,
  });
  const confirmMfa = useMutation({
    mutationFn: () => api.confirmMfa(mfaCode),
    onSuccess: async () => {
      setMfaCode('');
      setMfaSetup(null);
      await auth.reload();
    },
  });
  const disableMfa = useMutation({
    mutationFn: () => api.disableMfa(disableCode),
    onSuccess: async () => {
      setDisableCode('');
      await auth.reload();
    },
  });
  const revoke = useMutation({
    mutationFn: (sessionId: string) => api.revokeLoginSession(sessionId),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['login-sessions'] }),
  });

  const currentSession = useMemo(
    () => loginSessions.data?.find((session) => session.current),
    [loginSessions.data],
  );

  return (
    <div className="settings-stack">
      <section className="panel settings-panel">
        <div className="settings-panel-heading">
          <div>
            <span className="eyebrow">Account credential</span>
            <h2>Change password</h2>
            <p>Other login sessions are revoked after the password changes.</p>
          </div>
        </div>
        <form
          className="settings-form"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            password.mutate();
          }}
        >
          <div className="settings-form-grid">
            <label>
              Current password
              <input
                required
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>
            <label>
              New strong password
              <input
                required
                minLength={12}
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
              />
            </label>
          </div>
          {password.error ? <div className="error-banner">{password.error.message}</div> : null}
          {password.isSuccess ? <div className="success-banner">Password changed.</div> : null}
          <div className="settings-actions">
            <button
              className="button primary"
              disabled={password.isPending || !currentPassword || newPassword.length < 12}
            >
              {password.isPending ? 'Updating…' : 'Change password'}
            </button>
          </div>
        </form>
      </section>

      <section className="panel settings-panel">
        <div className="settings-panel-heading">
          <div>
            <span className="eyebrow">Second factor</span>
            <h2>Authenticator MFA</h2>
            <p>Use TOTP with encrypted secrets and single-use recovery codes.</p>
          </div>
          <span className={auth.me?.profile.mfaEnabled ? 'state-chip enabled' : 'state-chip'}>
            {auth.me?.profile.mfaEnabled ? 'Enabled' : 'Not enabled'}
          </span>
        </div>
        {!auth.me?.profile.mfaEnabled && !mfaSetup ? (
          <button className="button primary" onClick={() => setupMfa.mutate()} disabled={setupMfa.isPending}>
            {setupMfa.isPending ? 'Preparing…' : 'Set up MFA'}
          </button>
        ) : null}
        {mfaSetup ? (
          <div className="mfa-setup-box">
            <div>
              <strong>Authenticator secret</strong>
              <code>{mfaSetup.secret}</code>
              <small>Import this URI into a TOTP authenticator:</small>
              <code>{mfaSetup.otpauthUri}</code>
            </div>
            <div>
              <strong>Recovery codes</strong>
              <div className="recovery-code-grid">
                {mfaSetup.recoveryCodes.map((code) => (
                  <code key={code}>{code}</code>
                ))}
              </div>
              <small>Store these codes now. They are not shown again after setup.</small>
            </div>
            <form
              className="inline-security-form"
              onSubmit={(event) => {
                event.preventDefault();
                confirmMfa.mutate();
              }}
            >
              <input
                required
                pattern="\d{6}"
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value)}
                placeholder="6-digit code"
              />
              <button className="button primary" disabled={confirmMfa.isPending || mfaCode.length !== 6}>
                Confirm MFA
              </button>
            </form>
          </div>
        ) : null}
        {auth.me?.profile.mfaEnabled ? (
          <form
            className="inline-security-form"
            onSubmit={(event) => {
              event.preventDefault();
              disableMfa.mutate();
            }}
          >
            <input
              required
              value={disableCode}
              onChange={(event) => setDisableCode(event.target.value)}
              placeholder="Authenticator or recovery code"
            />
            <button className="button secondary" disabled={disableMfa.isPending || !disableCode}>
              Disable MFA
            </button>
          </form>
        ) : null}
        {setupMfa.error ? <div className="error-banner">{setupMfa.error.message}</div> : null}
        {confirmMfa.error ? <div className="error-banner">{confirmMfa.error.message}</div> : null}
        {disableMfa.error ? <div className="error-banner">{disableMfa.error.message}</div> : null}
      </section>

      <section className="panel settings-panel">
        <div className="settings-panel-heading compact-settings-heading">
          <div>
            <span className="eyebrow">Refresh-token inventory</span>
            <h2>Login sessions</h2>
          </div>
          <span className="count-pill">{loginSessions.data?.length ?? 0}</span>
        </div>
        {currentSession ? (
          <div className="security-current-session-note">
            Current session expires {formatDate(currentSession.expiresAt)}.
          </div>
        ) : null}
        {loginSessions.isLoading ? <SettingsLoading /> : null}
        {loginSessions.error ? <SettingsError message={loginSessions.error.message} /> : null}
        <div className="settings-table">
          {loginSessions.data?.map((session) => (
            <div className="settings-table-row session-row" key={session.id}>
              <div className="member-copy">
                <strong>
                  {session.current ? 'This device' : session.userAgent || 'Unknown browser'}
                </strong>
                <span>
                  {session.workspace.organization} · {session.workspace.name}
                </span>
                <small>
                  Last used {formatDate(session.lastUsedAt)} · expires {formatDate(session.expiresAt)}
                </small>
              </div>
              <span className={session.current ? 'state-chip enabled' : 'state-chip'}>
                {session.current ? 'Current' : 'Active'}
              </span>
              {!session.current ? (
                <button
                  type="button"
                  className="settings-row-action danger-text"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(session.id)}
                >
                  Revoke
                </button>
              ) : null}
            </div>
          ))}
        </div>
        {revoke.error ? <div className="error-banner">{revoke.error.message}</div> : null}
      </section>
    </div>
  );
}

function IntegrationSettings() {
  return (
    <>
      <CalendarIntegrationsSettings />
      <WebhookSettings />
    </>
  );
}

function CalendarIntegrationsSettings() {
  const queryClient = useQueryClient();
  const connections = useQuery({
    queryKey: ['calendar-integrations'],
    queryFn: () => api.listCalendarConnections(),
  });

  const connect = useMutation({
    mutationFn: (provider: CalendarProvider) =>
      api.beginCalendarConnection(
        provider,
        `${window.location.origin}/settings?tab=integrations`,
      ),
    onSuccess: (result) => {
      window.location.assign(result.authorizeUrl);
    },
  });

  const disconnect = useMutation({
    mutationFn: (provider: CalendarProvider) => api.disconnectCalendar(provider),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['calendar-integrations'] });
    },
  });

  const providers: Array<{
    provider: CalendarProvider;
    name: string;
    description: string;
  }> = [
    {
      provider: 'GOOGLE',
      name: 'Google Calendar',
      description: 'Use Google busy time and calendar events for scheduling.',
    },
    {
      provider: 'MICROSOFT',
      name: 'Microsoft Calendar',
      description: 'Connect Microsoft 365 / Outlook calendars through OAuth.',
    },
  ];

  return (
    <div className="settings-stack">
      <section className="panel settings-panel">
        <div className="settings-panel-heading">
          <div>
            <span className="eyebrow">Scheduling providers</span>
            <h2>Calendar connections</h2>
            <p>
              Calendar credentials use OAuth. Access and refresh tokens are encrypted
              before persistence and never returned to the browser.
            </p>
          </div>
        </div>
        {connections.isLoading ? <SettingsLoading /> : null}
        {connections.error ? (
          <SettingsError message={connections.error.message} />
        ) : null}
        <div className="calendar-integration-grid">
          {providers.map((item) => {
            const connection = connections.data?.find(
              (candidate) => candidate.provider === item.provider,
            );
            return (
              <article className="calendar-integration-card" key={item.provider}>
                <div>
                  <span
                    className={
                      connection?.status === 'CONNECTED'
                        ? 'state-chip enabled'
                        : 'state-chip'
                    }
                  >
                    {connection?.status === 'CONNECTED' ? 'Connected' : 'Not connected'}
                  </span>
                  <h3>{item.name}</h3>
                  <p>{item.description}</p>
                  {connection ? (
                    <small>
                      {connection.accountEmail || 'Connected account'}
                      {connection.tokenExpiresAt
                        ? ` · token expires ${formatDate(connection.tokenExpiresAt)}`
                        : ''}
                    </small>
                  ) : null}
                </div>
                <div className="settings-actions">
                  {connection ? (
                    <button
                      className="button secondary"
                      type="button"
                      disabled={disconnect.isPending}
                      onClick={() => {
                        if (window.confirm(`Disconnect ${item.name}?`)) {
                          disconnect.mutate(item.provider);
                        }
                      }}
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      className="button primary"
                      type="button"
                      disabled={connect.isPending}
                      onClick={() => connect.mutate(item.provider)}
                    >
                      Connect
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        {connect.error ? <div className="error-banner">{connect.error.message}</div> : null}
        {disconnect.error ? (
          <div className="error-banner">{disconnect.error.message}</div>
        ) : null}
      </section>
    </div>
  );
}

function WebhookSettings() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const currentRole = auth.me?.principal.roles[0] ?? 'GUEST';
  const canManage = ['OWNER', 'ADMIN'].includes(currentRole);
  const [apiKeyName, setApiKeyName] = useState('');
  const [apiKeyRole, setApiKeyRole] = useState<'HOST' | 'MEMBER' | 'ANALYST'>(
    'HOST',
  );
  const [apiKeyRead, setApiKeyRead] = useState(true);
  const [apiKeyWrite, setApiKeyWrite] = useState(false);
  const [apiKeyExpiry, setApiKeyExpiry] = useState('');
  const [revealedApiKey, setRevealedApiKey] = useState<{
    id: string;
    token: string;
    warning: string;
  } | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [eventTypes, setEventTypes] = useState(
    'session.started\nsession.ended\nrecording.ready\ntranscript.ready',
  );
  const [revealedSecret, setRevealedSecret] = useState<{
    subscriptionId: string;
    secret: string;
    warning: string;
  } | null>(null);

  const apiKeys = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => api.listApiKeys(),
    enabled: canManage,
  });

  const createApiKey = useMutation({
    mutationFn: () =>
      api.createApiKey({
        name: apiKeyName,
        role: apiKeyRole,
        scopes: [
          ...(apiKeyRead ? ['read'] : []),
          ...(apiKeyWrite ? ['write'] : []),
        ],
        ...(apiKeyExpiry
          ? { expiresAt: new Date(apiKeyExpiry).toISOString() }
          : {}),
      }),
    onSuccess: async (result) => {
      setApiKeyName('');
      setApiKeyRole('HOST');
      setApiKeyRead(true);
      setApiKeyWrite(false);
      setApiKeyExpiry('');
      setRevealedApiKey({
        id: result.id,
        token: result.token,
        warning: result.tokenWarning,
      });
      await queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const revokeApiKey = useMutation({
    mutationFn: (id: string) => api.revokeApiKey(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const webhooks = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => api.listWebhooks(),
    enabled: canManage,
  });

  const create = useMutation({
    mutationFn: () =>
      api.createWebhook({
        name,
        url,
        eventTypes: eventTypes
          .split(/[\n,;]/)
          .map((value) => value.trim())
          .filter(Boolean),
      }),
    onSuccess: async (result) => {
      setName('');
      setUrl('');
      setRevealedSecret({
        subscriptionId: result.id,
        secret: result.secret,
        warning: result.secretWarning,
      });
      await queryClient.invalidateQueries({ queryKey: ['webhooks'] });
    },
  });

  const toggle = useMutation({
    mutationFn: (input: { id: string; version: number; active: boolean }) =>
      api.updateWebhook(input.id, input.version, { active: input.active }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['webhooks'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteWebhook(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['webhooks'] });
    },
  });

  const rotate = useMutation({
    mutationFn: (id: string) => api.rotateWebhookSecret(id),
    onSuccess: async (result) => {
      setRevealedSecret({
        subscriptionId: result.id,
        secret: result.secret,
        warning: result.secretWarning,
      });
      await queryClient.invalidateQueries({ queryKey: ['webhooks'] });
    },
  });

  if (!canManage) {
    return (
      <div className="settings-stack">
        <section className="panel settings-panel">
          <div className="settings-panel-heading">
            <div>
              <span className="eyebrow">External automation</span>
              <h2>API and webhook integrations</h2>
              <p>
                Workspace owner or admin access is required to manage API credentials
                and webhook endpoints.
              </p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="settings-stack">
      <section className="panel settings-panel">
        <div className="settings-panel-heading">
          <div>
            <span className="eyebrow">Workspace API access</span>
            <h2>Create API key</h2>
            <p>
              Create a scoped bearer credential for server-to-server automation.
              Tokens are stored as hashes and the full value is shown only once.
            </p>
          </div>
        </div>
        <form
          className="settings-form"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            createApiKey.mutate();
          }}
        >
          <div className="settings-form-grid">
            <label>
              Key name
              <input
                required
                maxLength={160}
                value={apiKeyName}
                onChange={(event) => setApiKeyName(event.target.value)}
                placeholder="Production CRM"
              />
            </label>
            <label>
              Runtime role
              <select
                value={apiKeyRole}
                onChange={(event) =>
                  setApiKeyRole(
                    event.target.value as 'HOST' | 'MEMBER' | 'ANALYST',
                  )
                }
              >
                <option value="HOST">host</option>
                <option value="MEMBER">member</option>
                <option value="ANALYST">analyst</option>
              </select>
            </label>
            <label>
              Optional expiry
              <input
                type="datetime-local"
                value={apiKeyExpiry}
                onChange={(event) => setApiKeyExpiry(event.target.value)}
              />
            </label>
            <div className="api-key-scope-field">
              <span>Scopes</span>
              <label className="api-key-scope-option">
                <input
                  type="checkbox"
                  checked={apiKeyRead}
                  onChange={(event) => setApiKeyRead(event.target.checked)}
                />
                <span>
                  <strong>Read</strong>
                  <small>Allow GET/HEAD/OPTIONS API requests.</small>
                </span>
              </label>
              <label className="api-key-scope-option">
                <input
                  type="checkbox"
                  checked={apiKeyWrite}
                  onChange={(event) => setApiKeyWrite(event.target.checked)}
                />
                <span>
                  <strong>Write</strong>
                  <small>Allow mutating API requests. Write also permits reads.</small>
                </span>
              </label>
            </div>
          </div>
          {createApiKey.error ? (
            <div className="error-banner">{createApiKey.error.message}</div>
          ) : null}
          <div className="settings-actions">
            <button
              className="button primary"
              disabled={
                createApiKey.isPending ||
                !apiKeyName.trim() ||
                (!apiKeyRead && !apiKeyWrite)
              }
            >
              {createApiKey.isPending ? 'Creating…' : 'Create API key'}
            </button>
          </div>
        </form>

        {revealedApiKey ? (
          <div className="webhook-secret-box">
            <div>
              <strong>API key</strong>
              <small>{revealedApiKey.warning}</small>
            </div>
            <code>{revealedApiKey.token}</code>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                void navigator.clipboard.writeText(revealedApiKey.token);
              }}
            >
              Copy API key
            </button>
          </div>
        ) : null}
      </section>

      <section className="panel settings-panel">
        <div className="settings-panel-heading compact-settings-heading">
          <div>
            <span className="eyebrow">Server credentials</span>
            <h2>API keys</h2>
          </div>
          <span className="count-pill">{apiKeys.data?.length ?? 0}</span>
        </div>
        {apiKeys.isLoading ? <SettingsLoading /> : null}
        {apiKeys.error ? <SettingsError message={apiKeys.error.message} /> : null}
        <div className="webhook-card-list">
          {apiKeys.data?.map((key) => (
            <article className="webhook-card" key={key.id}>
              <div className="webhook-card-heading">
                <div>
                  <strong>{key.name}</strong>
                  <span>{key.tokenPrefix}••••••••</span>
                </div>
                <span className={key.revokedAt ? 'state-chip' : 'state-chip enabled'}>
                  {key.revokedAt ? 'Revoked' : 'Active'}
                </span>
              </div>
              <div className="webhook-event-tags">
                <code>{key.role.toLowerCase()}</code>
                {key.scopes.map((scope) => (
                  <code key={scope}>{scope}</code>
                ))}
              </div>
              <div className="webhook-card-meta">
                <span>Created {formatDate(key.createdAt)}</span>
                <span>Last used {formatDate(key.lastUsedAt)}</span>
                <span>
                  {key.expiresAt ? `Expires ${formatDate(key.expiresAt)}` : 'No expiry'}
                </span>
              </div>
              {!key.revokedAt ? (
                <div className="webhook-card-actions">
                  <button
                    type="button"
                    className="button danger"
                    disabled={revokeApiKey.isPending}
                    onClick={() => {
                      if (window.confirm(`Revoke API key "${key.name}"?`)) {
                        revokeApiKey.mutate(key.id);
                      }
                    }}
                  >
                    Revoke
                  </button>
                </div>
              ) : null}
            </article>
          ))}
          {apiKeys.data?.length === 0 ? (
            <div className="settings-empty-row">No API keys have been created.</div>
          ) : null}
        </div>
        {revokeApiKey.error ? (
          <div className="error-banner">{revokeApiKey.error.message}</div>
        ) : null}
      </section>

      <section className="panel settings-panel">
        <div className="settings-panel-heading">
          <div>
            <span className="eyebrow">Signed event delivery</span>
            <h2>Create webhook endpoint</h2>
            <p>
              Subscribe an HTTPS endpoint to workspace events. Deliveries use an HMAC-SHA256
              signature and retry with bounded exponential backoff.
            </p>
          </div>
        </div>
        <form
          className="settings-form"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <div className="settings-form-grid">
            <label>
              Endpoint name
              <input
                required
                maxLength={160}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="CRM automation"
              />
            </label>
            <label>
              HTTPS endpoint
              <input
                required
                type="url"
                maxLength={2000}
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/webhooks/sessions"
              />
            </label>
            <label className="settings-grid-span">
              Event types
              <textarea
                required
                rows={6}
                value={eventTypes}
                onChange={(event) => setEventTypes(event.target.value)}
                placeholder="session.started&#10;session.ended&#10;recording.ready"
              />
              <small>One event per line, or separate events with commas.</small>
            </label>
          </div>
          {create.error ? <div className="error-banner">{create.error.message}</div> : null}
          <div className="settings-actions">
            <button
              className="button primary"
              disabled={
                create.isPending ||
                !name.trim() ||
                !url.trim() ||
                !eventTypes.trim()
              }
            >
              {create.isPending ? 'Creating…' : 'Create webhook'}
            </button>
          </div>
        </form>

        {revealedSecret ? (
          <div className="webhook-secret-box">
            <div>
              <strong>Signing secret</strong>
              <small>{revealedSecret.warning}</small>
            </div>
            <code>{revealedSecret.secret}</code>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                void navigator.clipboard.writeText(revealedSecret.secret);
              }}
            >
              Copy secret
            </button>
          </div>
        ) : null}
      </section>

      <section className="panel settings-panel">
        <div className="settings-panel-heading compact-settings-heading">
          <div>
            <span className="eyebrow">Workspace endpoints</span>
            <h2>Webhook subscriptions</h2>
          </div>
          <span className="count-pill">{webhooks.data?.length ?? 0}</span>
        </div>
        {webhooks.isLoading ? <SettingsLoading /> : null}
        {webhooks.error ? <SettingsError message={webhooks.error.message} /> : null}
        <div className="webhook-card-list">
          {webhooks.data?.map((webhook) => {
            const latest = webhook.deliveries?.[0];
            return (
              <article className="webhook-card" key={webhook.id}>
                <div className="webhook-card-heading">
                  <div>
                    <strong>{webhook.name}</strong>
                    <span>{webhook.url}</span>
                  </div>
                  <span className={webhook.active ? 'state-chip enabled' : 'state-chip'}>
                    {webhook.active ? 'Active' : 'Paused'}
                  </span>
                </div>
                <div className="webhook-event-tags">
                  {webhook.eventTypes.map((eventType) => (
                    <code key={eventType}>{eventType}</code>
                  ))}
                </div>
                <div className="webhook-card-meta">
                  <span>{webhook._count?.deliveries ?? 0} deliveries</span>
                  <span>
                    {latest
                      ? `Latest: ${latest.status.toLowerCase()} · ${latest.eventType}`
                      : 'No deliveries yet'}
                  </span>
                </div>
                {latest?.lastError ? (
                  <small className="webhook-last-error">{latest.lastError}</small>
                ) : null}
                <div className="webhook-card-actions">
                  <button
                    type="button"
                    className="button secondary"
                    disabled={toggle.isPending}
                    onClick={() =>
                      toggle.mutate({
                        id: webhook.id,
                        version: webhook.version,
                        active: !webhook.active,
                      })
                    }
                  >
                    {webhook.active ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={rotate.isPending}
                    onClick={() => rotate.mutate(webhook.id)}
                  >
                    Rotate secret
                  </button>
                  <button
                    type="button"
                    className="button danger"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete webhook "${webhook.name}"?`)) {
                        remove.mutate(webhook.id);
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
          {webhooks.data?.length === 0 ? (
            <div className="settings-empty-row">No webhook endpoints have been created.</div>
          ) : null}
        </div>
        {toggle.error ? <div className="error-banner">{toggle.error.message}</div> : null}
        {rotate.error ? <div className="error-banner">{rotate.error.message}</div> : null}
        {remove.error ? <div className="error-banner">{remove.error.message}</div> : null}
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function SettingsLoading() {
  return <div className="settings-loading">Loading settings…</div>;
}

function SettingsError({ message }: { message: string }) {
  return <div className="error-banner">{message}</div>;
}
