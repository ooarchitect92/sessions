import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkspaceRole } from '@sessions/contracts';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type WorkspaceMember } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { NotificationSettings } from '../components/NotificationSettings';

const TABS = ['workspace', 'members', 'workspaces', 'integrations', 'notifications', 'security'] as const;
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
                        : item === 'notifications'
                          ? '✉'
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
                      : item === 'notifications'
                        ? 'Notifications'
                        : 'Security'}
            </button>
          ))}
        </nav>
        <section className="settings-content">
          {tab === 'workspace' ? <WorkspaceProfile /> : null}
          {tab === 'members' ? <MembersAndInvitations /> : null}
          {tab === 'workspaces' ? <WorkspaceDirectory /> : null}
          {tab === 'integrations' ? <CalendarIntegrations /> : null}
          {tab === 'notifications' ? <NotificationSettings /> : null}
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

function CalendarIntegrations() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const connections = useQuery({
    queryKey: ['calendar-connections'],
    queryFn: () => api.listCalendarConnections(),
  });

  const connect = useMutation({
    mutationFn: (provider: 'google' | 'microsoft') =>
      api.startCalendarOauth(provider),
    onSuccess: (result) => {
      window.location.assign(result.authorizationUrl);
    },
  });

  const sync = useMutation({
    mutationFn: (id: string) => api.syncCalendarConnection(id),
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: ['calendar-connections'] }),
  });

  const disconnect = useMutation({
    mutationFn: (id: string) => api.disconnectCalendarConnection(id),
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: ['calendar-connections'] }),
  });

  const oauthStatus = searchParams.get('calendar');
  const oauthReason = searchParams.get('reason');

  return (
    <div className="settings-stack">
      <section className="panel settings-panel">
        <div className="settings-panel-heading">
          <div>
            <span className="eyebrow">Scheduling providers</span>
            <h2>Calendar connections</h2>
            <p>
              Connect Google or Microsoft Calendar. Busy intervals are synchronized
              into the workspace availability cache and automatically removed from
              public booking slots.
            </p>
          </div>
        </div>

        {oauthStatus === 'connected' ? (
          <div className="success-banner">
            Calendar connected. Initial availability synchronization has started.
          </div>
        ) : null}
        {oauthStatus === 'error' ? (
          <div className="error-banner">
            Calendar connection failed{oauthReason ? `: ${oauthReason}` : '.'}
          </div>
        ) : null}

        <div className="calendar-provider-grid">
          <article className="calendar-provider-card">
            <div>
              <strong>Google Calendar</strong>
              <span>Read-only free/busy access with offline refresh.</span>
            </div>
            <button
              type="button"
              className="button primary"
              disabled={connect.isPending}
              onClick={() => connect.mutate('google')}
            >
              Connect Google
            </button>
          </article>
          <article className="calendar-provider-card">
            <div>
              <strong>Microsoft Calendar</strong>
              <span>Microsoft Graph schedule access with offline refresh.</span>
            </div>
            <button
              type="button"
              className="button primary"
              disabled={connect.isPending}
              onClick={() => connect.mutate('microsoft')}
            >
              Connect Microsoft
            </button>
          </article>
        </div>
        {connect.error ? <div className="error-banner">{connect.error.message}</div> : null}
      </section>

      <section className="panel settings-panel">
        <div className="settings-panel-heading compact-settings-heading">
          <div>
            <span className="eyebrow">Availability cache</span>
            <h2>Connected accounts</h2>
          </div>
          <span className="count-pill">{connections.data?.length ?? 0}</span>
        </div>
        {connections.isLoading ? <SettingsLoading /> : null}
        {connections.error ? <SettingsError message={connections.error.message} /> : null}
        <div className="settings-table">
          {connections.data?.map((connection) => (
            <div className="settings-table-row calendar-connection-row" key={connection.id}>
              <div className="member-copy">
                <strong>
                  {connection.provider === 'GOOGLE' ? 'Google Calendar' : 'Microsoft Calendar'}
                </strong>
                <span>
                  {connection.accountEmail ?? connection.user.email} · {connection.user.displayName}
                </span>
                <small>
                  {connection.busyBlockCount} busy intervals · Last synchronized{' '}
                  {formatDate(connection.lastSyncedAt)}
                </small>
                {connection.lastError ? (
                  <small className="danger-text">{connection.lastError}</small>
                ) : null}
              </div>
              <span className={`invitation-status status-${connection.status.toLowerCase()}`}>
                {connection.status.toLowerCase().replace('_', ' ')}
              </span>
              <button
                type="button"
                className="settings-row-action"
                disabled={sync.isPending || connection.status === 'REVOKED'}
                onClick={() => sync.mutate(connection.id)}
              >
                Sync now
              </button>
              <button
                type="button"
                className="settings-row-action danger-text"
                disabled={disconnect.isPending || connection.status === 'REVOKED'}
                onClick={() => {
                  if (window.confirm('Disconnect this calendar account?')) {
                    disconnect.mutate(connection.id);
                  }
                }}
              >
                Disconnect
              </button>
            </div>
          ))}
          {connections.data?.length === 0 ? (
            <div className="settings-empty-row">No calendar accounts are connected.</div>
          ) : null}
        </div>
        {sync.error ? <div className="error-banner">{sync.error.message}</div> : null}
        {disconnect.error ? <div className="error-banner">{disconnect.error.message}</div> : null}
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
  const [apiKeyName, setApiKeyName] = useState('');
  const [apiKeyRead, setApiKeyRead] = useState(true);
  const [apiKeyWrite, setApiKeyWrite] = useState(false);
  const [apiKeyExpiresInDays, setApiKeyExpiresInDays] = useState(90);
  const [newApiKeyToken, setNewApiKeyToken] = useState<string | null>(null);
  const canManageApiKeys = auth.me?.principal.roles.some((role) =>
    ['OWNER', 'ADMIN'].includes(role),
  ) ?? false;
  const apiKeys = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => api.listApiKeys(),
    enabled: canManageApiKeys,
  });

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
  const createApiKey = useMutation({
    mutationFn: () => {
      const scopes: Array<'read' | 'write'> = [];
      if (apiKeyRead) scopes.push('read');
      if (apiKeyWrite) scopes.push('write');
      if (scopes.length === 0) throw new Error('Select at least one API key scope');
      return api.createApiKey({
        name: apiKeyName,
        scopes,
        expiresInDays: apiKeyExpiresInDays,
      });
    },
    onSuccess: async (created) => {
      setNewApiKeyToken(created.token);
      setApiKeyName('');
      setApiKeyRead(true);
      setApiKeyWrite(false);
      setApiKeyExpiresInDays(90);
      await queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });
  const revokeApiKey = useMutation({
    mutationFn: (id: string) => api.revokeApiKey(id),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
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

      {canManageApiKeys ? (
        <section className="panel settings-panel">
          <div className="settings-panel-heading">
            <div>
              <span className="eyebrow">Programmatic access</span>
              <h2>Workspace API keys</h2>
              <p>
                Keys are tenant-scoped, hashed at rest, and reveal their full token only once.
                Read and write scopes are enforced by the API gateway.
              </p>
            </div>
            <span className="count-pill">{apiKeys.data?.length ?? 0}</span>
          </div>

          <form
            className="settings-form api-key-form"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              setNewApiKeyToken(null);
              createApiKey.mutate();
            }}
          >
            <div className="settings-form-grid">
              <label>
                Key name
                <input
                  required
                  maxLength={100}
                  value={apiKeyName}
                  onChange={(event) => setApiKeyName(event.target.value)}
                  placeholder="Production reporting"
                />
              </label>
              <label>
                Expires after
                <select
                  value={apiKeyExpiresInDays}
                  onChange={(event) => setApiKeyExpiresInDays(Number(event.target.value))}
                >
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                  <option value={180}>180 days</option>
                  <option value={365}>1 year</option>
                </select>
              </label>
            </div>
            <div className="api-key-scope-grid">
              <label className="settings-toggle-row">
                <input
                  type="checkbox"
                  checked={apiKeyRead}
                  onChange={(event) => setApiKeyRead(event.target.checked)}
                />
                <span>
                  <strong>Read</strong>
                  <small>Allows authenticated GET/HEAD/OPTIONS requests.</small>
                </span>
              </label>
              <label className="settings-toggle-row">
                <input
                  type="checkbox"
                  checked={apiKeyWrite}
                  onChange={(event) => setApiKeyWrite(event.target.checked)}
                />
                <span>
                  <strong>Write</strong>
                  <small>Allows POST/PATCH/PUT/DELETE requests subject to RBAC.</small>
                </span>
              </label>
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

          {newApiKeyToken ? (
            <div className="development-token-box api-key-secret-box">
              <div>
                <strong>Copy this API key now</strong>
                <small>For security, the full token will not be shown again.</small>
              </div>
              <code>{newApiKeyToken}</code>
              <button
                type="button"
                className="button secondary"
                onClick={() => void navigator.clipboard.writeText(newApiKeyToken)}
              >
                Copy key
              </button>
            </div>
          ) : null}

          {apiKeys.isLoading ? <SettingsLoading /> : null}
          {apiKeys.error ? <SettingsError message={apiKeys.error.message} /> : null}
          <div className="settings-table">
            {apiKeys.data?.map((key) => (
              <div className="settings-table-row api-key-row" key={key.id}>
                <div className="member-copy">
                  <strong>{key.name}</strong>
                  <span>
                    {key.tokenPrefix}… · {key.scopes.join(', ')}
                  </span>
                  <small>
                    Created {formatDate(key.createdAt)} · Last used {formatDate(key.lastUsedAt)}
                    {key.expiresAt ? ` · Expires ${formatDate(key.expiresAt)}` : ''}
                  </small>
                </div>
                <span className={key.revokedAt ? 'state-chip' : 'state-chip enabled'}>
                  {key.revokedAt ? 'Revoked' : 'Active'}
                </span>
                {!key.revokedAt ? (
                  <button
                    type="button"
                    className="settings-row-action danger-text"
                    disabled={revokeApiKey.isPending}
                    onClick={() => {
                      if (window.confirm(`Revoke API key "${key.name}"?`)) {
                        revokeApiKey.mutate(key.id);
                      }
                    }}
                  >
                    Revoke
                  </button>
                ) : null}
              </div>
            ))}
            {apiKeys.data?.length === 0 ? (
              <div className="settings-empty-row">No API keys have been created.</div>
            ) : null}
          </div>
          {revokeApiKey.error ? (
            <div className="error-banner">{revokeApiKey.error.message}</div>
          ) : null}
        </section>
      ) : null}

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
