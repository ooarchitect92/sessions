import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkspaceRole } from '@sessions/contracts';
import { FormEvent, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type ApiKeyRecord, type WebhookSubscriptionRecord, type WorkspaceEmailTemplateKind, type WorkspaceMember } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const TABS = ['workspace', 'members', 'workspaces', 'billing', 'domains', 'emails', 'integrations', 'enterprise', 'compliance', 'security'] as const;
type SettingsTab = (typeof TABS)[number];

const MEMBER_ROLES: WorkspaceRole[] = ['ADMIN', 'HOST', 'MEMBER', 'ANALYST', 'GUEST'];
const ALL_ROLES: WorkspaceRole[] = ['OWNER', ...MEMBER_ROLES];

function csvEscape(value: unknown): string {
  const text = String(value ?? '');
  return /[\",\n]/.test(text) ? `\"${text.replaceAll('\"', '\"\"')}\"` : text;
}

function downloadCsv(input: { filename: string; columns: string[]; rows: Array<Record<string, unknown>> }) {
  const content = [
    input.columns.map(csvEscape).join(','),
    ...input.rows.map((row) => input.columns.map((column) => csvEscape(row[column])).join(',')),
  ].join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = input.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
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
                      : item === 'billing'
                        ? '◫'
                        : item === 'domains'
                          ? '◎'
                          : item === 'emails'
                          ? '✉'
                          : item === 'integrations'
                            ? '⛓'
                            : item === 'enterprise'
                              ? '◆'
                              : item === 'compliance'
                                ? '▣'
                                : '⌾'}
              </span>
              {item === 'workspace'
                ? 'Workspace profile'
                : item === 'members'
                  ? 'Members and invites'
                  : item === 'workspaces'
                    ? 'Your workspaces'
                    : item === 'billing'
                      ? 'Plan and usage'
                      : item === 'domains'
                        ? 'Domains'
                        : item === 'emails'
                        ? 'Emails'
                        : item === 'integrations'
                          ? 'Integrations'
                          : item === 'enterprise'
                            ? 'Enterprise'
                            : item === 'compliance'
                              ? 'Compliance'
                              : 'Security'}
            </button>
          ))}
        </nav>
        <section className="settings-content">
          {tab === 'workspace' ? <WorkspaceProfile /> : null}
          {tab === 'members' ? <MembersAndInvitations /> : null}
          {tab === 'workspaces' ? <WorkspaceDirectory /> : null}
          {tab === 'billing' ? <BillingSettings /> : null}
          {tab === 'domains' ? <DomainSettings /> : null}
          {tab === 'emails' ? <EmailTemplateSettings /> : null}
          {tab === 'integrations' ? <IntegrationsSettings /> : null}
          {tab === 'enterprise' ? <EnterpriseSettings /> : null}
          {tab === 'compliance' ? <ComplianceSettings /> : null}
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
  const [logoUrl, setLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#183f38');
  const [accentColor, setAccentColor] = useState('#dcefe8');
  const [fontFamily, setFontFamily] = useState('Inter');
  const [waitingRoomImageUrl, setWaitingRoomImageUrl] = useState('');
  const canManage = ['OWNER', 'ADMIN'].includes(workspace.data?.currentRole ?? 'GUEST');

  useEffect(() => {
    if (!workspace.data) return;
    setName(workspace.data.name);
    setSlug(workspace.data.slug);
    setTimezone(workspace.data.timezone);
    setRecordingConsentRequired(
      workspace.data.settings.recordingConsentRequired !== false,
    );
    const branding =
      workspace.data.settings.branding &&
      typeof workspace.data.settings.branding === 'object' &&
      !Array.isArray(workspace.data.settings.branding)
        ? (workspace.data.settings.branding as Record<string, unknown>)
        : {};
    setLogoUrl(typeof branding.logoUrl === 'string' ? branding.logoUrl : '');
    setPrimaryColor(
      typeof branding.primaryColor === 'string' ? branding.primaryColor : '#183f38',
    );
    setAccentColor(
      typeof branding.accentColor === 'string' ? branding.accentColor : '#dcefe8',
    );
    setFontFamily(typeof branding.fontFamily === 'string' ? branding.fontFamily : 'Inter');
    setWaitingRoomImageUrl(
      typeof branding.waitingRoomImageUrl === 'string' ? branding.waitingRoomImageUrl : '',
    );
  }, [workspace.data]);

  const update = useMutation({
    mutationFn: () => {
      if (!workspace.data) throw new Error('Workspace is unavailable');
      return api.updateCurrentWorkspace(workspace.data.version, {
        name,
        slug,
        timezone,
        settings: {
          recordingConsentRequired,
          branding: {
            logoUrl: logoUrl.trim(),
            primaryColor,
            accentColor,
            fontFamily: fontFamily.trim(),
            waitingRoomImageUrl: waitingRoomImageUrl.trim(),
          },
        },
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
          <div className="settings-branding-block">
            <div className="settings-panel-heading compact-settings-heading">
              <div>
                <span className="eyebrow">Workspace identity</span>
                <h3>Branding</h3>
                <p>Set the visual identity reused by meeting, booking, event, and waiting-room experiences.</p>
              </div>
            </div>
            <div className="settings-form-grid">
              <label>
                Logo URL
                <input
                  disabled={!canManage}
                  type="url"
                  value={logoUrl}
                  onChange={(event) => setLogoUrl(event.target.value)}
                  placeholder="https://cdn.example.com/logo.svg"
                />
              </label>
              <label>
                Waiting-room image URL
                <input
                  disabled={!canManage}
                  type="url"
                  value={waitingRoomImageUrl}
                  onChange={(event) => setWaitingRoomImageUrl(event.target.value)}
                  placeholder="https://cdn.example.com/waiting-room.jpg"
                />
              </label>
              <label>
                Primary color
                <div className="settings-color-field">
                  <input disabled={!canManage} type="color" value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value)} />
                  <input disabled={!canManage} value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value)} pattern="^#[0-9A-Fa-f]{6}$" />
                </div>
              </label>
              <label>
                Accent color
                <div className="settings-color-field">
                  <input disabled={!canManage} type="color" value={accentColor} onChange={(event) => setAccentColor(event.target.value)} />
                  <input disabled={!canManage} value={accentColor} onChange={(event) => setAccentColor(event.target.value)} pattern="^#[0-9A-Fa-f]{6}$" />
                </div>
              </label>
              <label className="settings-grid-span">
                Font family
                <input disabled={!canManage} value={fontFamily} onChange={(event) => setFontFamily(event.target.value)} placeholder="Inter" />
              </label>
            </div>
            <div className="settings-brand-preview" style={{ '--brand-primary': primaryColor, '--brand-accent': accentColor, fontFamily } as CSSProperties}>
              <div className="settings-brand-preview-logo">
                {logoUrl ? <img src={logoUrl} alt="Workspace logo preview" /> : <span>{name.slice(0, 1).toUpperCase() || 'S'}</span>}
              </div>
              <div>
                <strong>{name || 'Workspace name'}</strong>
                <small>Preview of your workspace identity</small>
              </div>
              <button type="button">Join session</button>
            </div>
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

function limitLabel(value: number): string {
  return value < 0 ? 'Unlimited' : String(value);
}

function usagePercent(used: number, limit: number): number {
  if (limit < 0) return 0;
  if (limit === 0) return 100;
  return Math.min(100, Math.round((used / limit) * 100));
}

function BillingSettings() {
  const auth = useAuth();
  const canManage = auth.me?.principal.roles.some((role) => ['OWNER', 'ADMIN'].includes(role)) ?? false;
  const current = useQuery({
    queryKey: ['billing-current'],
    queryFn: () => api.getBillingCurrent(),
  });
  const plans = useQuery({
    queryKey: ['billing-plans'],
    queryFn: () => api.listBillingPlans(),
    enabled: canManage,
  });

  if (current.isLoading) return <SettingsLoading />;
  if (current.error || !current.data) return <SettingsError message={current.error?.message ?? 'Billing information unavailable'} />;

  const data = current.data;
  const metrics = [
    { label: 'Seats', used: data.usage.seats, limit: data.plan.limits.seats },
    { label: 'Sessions / period', used: data.usage.sessions, limit: data.plan.limits.sessionsPerMonth },
    { label: 'Events / period', used: data.usage.events, limit: data.plan.limits.eventsPerMonth },
    { label: 'Booking pages', used: data.usage.bookingPages, limit: data.plan.limits.bookingPages },
  ];

  return (
    <div className="settings-stack">
      <section className="panel settings-panel">
        <div className="settings-panel-heading">
          <div>
            <span className="eyebrow">Entitlements</span>
            <h2>{data.plan.name} plan</h2>
            <p>Usage is enforced server-side before new sessions, events, booking pages, or workspace invitations are created.</p>
          </div>
          <span className="settings-role-chip">{data.subscription.status.toLowerCase()}</span>
        </div>
        <div className="billing-usage-grid">
          {metrics.map((metric) => (
            <article key={metric.label}>
              <div><span>{metric.label}</span><strong>{metric.used} / {limitLabel(metric.limit)}</strong></div>
              <div className="billing-meter" aria-label={`${metric.label} usage`}>
                <span style={{ width: `${usagePercent(metric.used, metric.limit)}%` }} />
              </div>
            </article>
          ))}
        </div>
        <div className="billing-period-row">
          <span><strong>Current period</strong><small>{formatDate(data.subscription.currentPeriodStart)} → {formatDate(data.subscription.currentPeriodEnd)}</small></span>
          <span><strong>Event capacity</strong><small>Up to {limitLabel(data.plan.limits.eventCapacity)} registrations per event</small></span>
          <span><strong>Provider</strong><small>{data.subscription.provider ?? 'Internal entitlement state'}</small></span>
        </div>
      </section>

      {canManage ? (
        <section className="panel settings-panel">
          <div className="settings-panel-heading">
            <div>
              <span className="eyebrow">Plan catalog</span>
              <h2>Available tiers</h2>
              <p>Catalog values are platform configuration. Payment-provider checkout and verified subscription webhooks remain a separate release gate.</p>
            </div>
          </div>
          {plans.isLoading ? <SettingsLoading /> : null}
          {plans.error ? <SettingsError message={plans.error.message} /> : null}
          <div className="billing-plan-grid">
            {plans.data?.map((plan) => (
              <article className={plan.code === data.plan.code ? 'billing-plan-card current' : 'billing-plan-card'} key={plan.code}>
                <div className="billing-plan-heading"><strong>{plan.name}</strong>{plan.code === data.plan.code ? <span>Current</span> : null}</div>
                <div className="billing-plan-price">
                  <strong>{plan.monthly_price_cents === 0 ? 'Free' : new Intl.NumberFormat(undefined, { style: 'currency', currency: plan.currency, maximumFractionDigits: 0 }).format(plan.monthly_price_cents / 100)}</strong>
                  {plan.monthly_price_cents > 0 ? <small>/ month</small> : null}
                </div>
                <ul>
                  <li>{limitLabel(plan.limits.seats)} seats</li>
                  <li>{limitLabel(plan.limits.sessionsPerMonth)} sessions / period</li>
                  <li>{limitLabel(plan.limits.eventsPerMonth)} events / period</li>
                  <li>{limitLabel(plan.limits.bookingPages)} booking pages</li>
                  <li>{limitLabel(plan.limits.eventCapacity)} event capacity</li>
                </ul>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
const EMAIL_TEMPLATE_DEFAULTS: Record<WorkspaceEmailTemplateKind, { label: string; subject: string; bodyText: string }> = {
  EVENT_REMINDER_24H: { label: 'Event reminder · 24 hours', subject: 'Reminder: {{event_title}} starts tomorrow', bodyText: 'Hi {{attendee_name}},\n\n{{event_title}} starts in 24 hours.\n\nTime: {{event_time}} ({{event_timezone}})' },
  EVENT_REMINDER_1H: { label: 'Event reminder · 1 hour', subject: 'Reminder: {{event_title}} starts in 1 hour', bodyText: 'Hi {{attendee_name}},\n\n{{event_title}} starts in 1 hour.\n\nTime: {{event_time}} ({{event_timezone}})' },
  BOOKING_REMINDER_24H: { label: 'Booking reminder · 24 hours', subject: 'Reminder: {{booking_title}} starts tomorrow', bodyText: 'Hi {{attendee_name}},\n\n{{booking_title}} starts in 24 hours.\n\nTime: {{booking_time}} ({{booking_timezone}})' },
  BOOKING_REMINDER_1H: { label: 'Booking reminder · 1 hour', subject: 'Reminder: {{booking_title}} starts in 1 hour', bodyText: 'Hi {{attendee_name}},\n\n{{booking_title}} starts in 1 hour.\n\nTime: {{booking_time}} ({{booking_timezone}})' },
};

function EmailTemplateSettings() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const canManage = auth.me?.principal.roles.some((role) => ['OWNER', 'ADMIN', 'HOST'].includes(role)) ?? false;
  const templates = useQuery({
    queryKey: ['workspace-email-templates'],
    queryFn: () => api.listWorkspaceEmailTemplates(),
    enabled: canManage,
  });
  const [kind, setKind] = useState<WorkspaceEmailTemplateKind>('EVENT_REMINDER_24H');
  const selected = templates.data?.find((item) => item.kind === kind);
  const defaults = EMAIL_TEMPLATE_DEFAULTS[kind];
  const [subject, setSubject] = useState(defaults.subject);
  const [bodyText, setBodyText] = useState(defaults.bodyText);
  const [signature, setSignature] = useState('');
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const next = templates.data?.find((item) => item.kind === kind);
    const fallback = EMAIL_TEMPLATE_DEFAULTS[kind];
    setSubject(next?.subject ?? fallback.subject);
    setBodyText(next?.body_text ?? fallback.bodyText);
    setSignature(next?.signature ?? '');
    setEnabled(next?.enabled ?? true);
  }, [kind, templates.data]);

  const save = useMutation({
    mutationFn: () => api.saveWorkspaceEmailTemplate({ kind, enabled, subject, bodyText, signature }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['workspace-email-templates'] }),
  });

  const variableHint = kind.startsWith('EVENT_')
    ? '{{event_title}}, {{attendee_name}}, {{event_time}}, {{event_timezone}}'
    : '{{booking_title}}, {{attendee_name}}, {{booking_time}}, {{booking_timezone}}';

  return (
    <div className="settings-stack">
      <section className="panel settings-panel">
        <div className="settings-panel-heading">
          <div>
            <span className="eyebrow">Branded notifications</span>
            <h2>Workspace email templates</h2>
            <p>Configure reusable reminder copy and a workspace signature. New events inherit the workspace event templates.</p>
          </div>
        </div>
        {!canManage ? <SettingsError message="Host, admin, or owner access is required to manage email templates." /> : null}
        {canManage ? (
          <form className="settings-form" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
            <div className="settings-form-grid">
              <label>
                Template
                <select value={kind} onChange={(event) => setKind(event.target.value as WorkspaceEmailTemplateKind)}>
                  {(Object.keys(EMAIL_TEMPLATE_DEFAULTS) as WorkspaceEmailTemplateKind[]).map((item) => <option key={item} value={item}>{EMAIL_TEMPLATE_DEFAULTS[item].label}</option>)}
                </select>
              </label>
              <label className="settings-toggle-row email-template-toggle">
                <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
                <span><strong>Enabled by default</strong><small>Controls whether newly-created reminders are active.</small></span>
              </label>
              <label className="settings-grid-span">
                Subject
                <input required maxLength={240} value={subject} onChange={(event) => setSubject(event.target.value)} />
              </label>
              <label className="settings-grid-span">
                Body
                <textarea required rows={9} maxLength={10000} value={bodyText} onChange={(event) => setBodyText(event.target.value)} />
              </label>
              <label className="settings-grid-span">
                Global signature
                <textarea rows={4} maxLength={2000} value={signature} onChange={(event) => setSignature(event.target.value)} placeholder="Regards,\nYour team" />
              </label>
            </div>
            <div className="email-variable-hint"><strong>Available variables</strong><code>{variableHint}</code></div>
            {selected ? <small className="settings-muted">Saved version {selected.version} · updated {formatDate(selected.updated_at)}</small> : null}
            {save.error ? <div className="error-banner">{save.error.message}</div> : null}
            {save.isSuccess ? <div className="success-banner">Workspace email template saved.</div> : null}
            <div className="settings-actions"><button className="button primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save template'}</button></div>
          </form>
        ) : null}
      </section>
    </div>
  );
}
function EnterpriseSettings() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const canManage = auth.me?.principal.roles.some((role) => ['OWNER', 'ADMIN'].includes(role)) ?? false;
  const identity = useQuery({ queryKey: ['enterprise-identity'], queryFn: () => api.getEnterpriseIdentity(), enabled: canManage });
  const tokens = useQuery({ queryKey: ['scim-tokens'], queryFn: () => api.listScimTokens(), enabled: canManage });
  const [enabled, setEnabled] = useState(false);
  const [enforceSso, setEnforceSso] = useState(false);
  const [issuerUrl, setIssuerUrl] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [authorizationEndpoint, setAuthorizationEndpoint] = useState('');
  const [tokenEndpoint, setTokenEndpoint] = useState('');
  const [userinfoEndpoint, setUserinfoEndpoint] = useState('');
  const [jwksUri, setJwksUri] = useState('');
  const [endSessionEndpoint, setEndSessionEndpoint] = useState('');
  const [domains, setDomains] = useState('');
  const [roleAttribute, setRoleAttribute] = useState('');
  const [roleMappingsText, setRoleMappingsText] = useState('');
  const [defaultRole, setDefaultRole] = useState<Exclude<WorkspaceRole, 'OWNER'>>('MEMBER');
  const [scimName, setScimName] = useState('Provisioning token');
  const [issuedToken, setIssuedToken] = useState('');

  useEffect(() => {
    if (!identity.data) return;
    setEnabled(identity.data.enabled);
    setEnforceSso(identity.data.enforceSso);
    setIssuerUrl(identity.data.issuerUrl ?? '');
    setClientId(identity.data.clientId ?? '');
    setAuthorizationEndpoint(identity.data.authorizationEndpoint ?? '');
    setTokenEndpoint(identity.data.tokenEndpoint ?? '');
    setUserinfoEndpoint(identity.data.userinfoEndpoint ?? '');
    setJwksUri(identity.data.jwksUri ?? '');
    setEndSessionEndpoint(identity.data.endSessionEndpoint ?? '');
    setDomains(identity.data.emailDomains.join(', '));
    setRoleAttribute(identity.data.roleAttribute ?? '');
    setRoleMappingsText(Object.entries(identity.data.roleMappings ?? {}).map(([claim, role]) => `${claim}=${role}`).join('\n'));
    setDefaultRole(identity.data.defaultRole ?? 'MEMBER');
  }, [identity.data]);

  const save = useMutation({
    mutationFn: () => {
      const roleMappings = Object.fromEntries(
        roleMappingsText
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const separator = line.lastIndexOf('=');
            if (separator <= 0) throw new Error('Each role mapping must use claim-value=ROLE');
            const claimValue = line.slice(0, separator).trim();
            const role = line.slice(separator + 1).trim().toUpperCase();
            if (!['ADMIN', 'HOST', 'MEMBER', 'ANALYST', 'GUEST'].includes(role)) {
              throw new Error(`Unsupported mapped role: ${role}`);
            }
            return [claimValue, role] as const;
          }),
      ) as Record<string, Exclude<WorkspaceRole, 'OWNER'>>;
      return api.saveEnterpriseIdentity({
        protocol: 'OIDC', enabled, enforceSso, issuerUrl, clientId, ...(clientSecret ? { clientSecret } : {}),
        authorizationEndpoint, tokenEndpoint, userinfoEndpoint, jwksUri, endSessionEndpoint, scopes: ['openid','profile','email'],
        emailDomains: domains.split(',').map((item) => item.trim()).filter(Boolean),
        roleAttribute: roleAttribute.trim() || undefined,
        roleMappings,
        defaultRole,
      });
    },
    onSuccess: async () => { setClientSecret(''); await queryClient.invalidateQueries({ queryKey: ['enterprise-identity'] }); },
  });
  const createToken = useMutation({
    mutationFn: () => api.createScimToken({ name: scimName }),
    onSuccess: async (result) => { setIssuedToken(result.token ?? ''); await queryClient.invalidateQueries({ queryKey: ['scim-tokens'] }); },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeScimToken(id),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['scim-tokens'] }),
  });

  if (!canManage) return <SettingsError message="Owner or admin access is required to manage enterprise identity." />;
  return (
    <div className="settings-stack">
      <section className="panel settings-panel">
        <div className="settings-panel-heading"><div><span className="eyebrow">Enterprise identity</span><h2>OIDC single sign-on policy</h2><p>Persist IdP configuration, allowed domains, secret material, and enforcement policy. Provider callback qualification remains a separate release gate.</p></div></div>
        <form className="settings-form" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
          <label className="settings-toggle-row"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span><strong>Enable OIDC</strong><small>Activates this workspace identity-provider configuration.</small></span></label>
          <label className="settings-toggle-row"><input type="checkbox" checked={enforceSso} onChange={(event) => setEnforceSso(event.target.checked)} /><span><strong>Enforce SSO policy</strong><small>Marks the workspace for SSO-only enforcement once provider login is qualified.</small></span></label>
          <div className="settings-form-grid">
            <label className="settings-grid-span">Issuer URL<input type="url" value={issuerUrl} onChange={(event) => setIssuerUrl(event.target.value)} placeholder="https://idp.example.com" /></label>
            <label>Client ID<input value={clientId} onChange={(event) => setClientId(event.target.value)} /></label>
            <label>Client secret<input type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder={identity.data?.hasClientSecret ? 'Secret already stored' : 'Enter client secret'} /></label>
            <label>Authorization endpoint<input type="url" value={authorizationEndpoint} onChange={(event) => setAuthorizationEndpoint(event.target.value)} /></label>
            <label>Token endpoint<input type="url" value={tokenEndpoint} onChange={(event) => setTokenEndpoint(event.target.value)} /></label>
            <label>UserInfo endpoint<input type="url" value={userinfoEndpoint} onChange={(event) => setUserinfoEndpoint(event.target.value)} /></label>
            <label>JWKS URI<input type="url" value={jwksUri} onChange={(event) => setJwksUri(event.target.value)} /></label>
            <label>End-session endpoint<input type="url" value={endSessionEndpoint} onChange={(event) => setEndSessionEndpoint(event.target.value)} placeholder="https://idp.example.com/logout" /></label>
            <label className="settings-grid-span">Allowed email domains<input value={domains} onChange={(event) => setDomains(event.target.value)} placeholder="example.com, subsidiary.example.com" /></label>
            <label>Role claim path<input value={roleAttribute} onChange={(event) => setRoleAttribute(event.target.value)} placeholder="groups or realm_access.role" /></label>
            <label>Default enterprise role<select value={defaultRole} onChange={(event) => setDefaultRole(event.target.value as Exclude<WorkspaceRole, 'OWNER'>)}><option value="MEMBER">Member</option><option value="HOST">Host</option><option value="ANALYST">Analyst</option><option value="GUEST">Guest</option><option value="ADMIN">Admin</option></select></label>
            <label className="settings-grid-span">Claim-to-role mappings<textarea rows={5} value={roleMappingsText} onChange={(event) => setRoleMappingsText(event.target.value)} placeholder={"sessions-admins=ADMIN\nsales-hosts=HOST\nanalysts=ANALYST"} /><small>One mapping per line. The left side is an IdP claim value; the right side is ADMIN, HOST, MEMBER, ANALYST, or GUEST. OWNER can never be assigned by SSO.</small></label>
          </div>
          {save.error ? <div className="error-banner">{save.error.message}</div> : null}
          {save.isSuccess ? <div className="success-banner">Enterprise identity policy saved.</div> : null}
          <div className="settings-actions"><button className="button primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save identity policy'}</button></div>
        </form>
      </section>
      <section className="panel settings-panel">
        <div className="settings-panel-heading"><div><span className="eyebrow">SCIM 2.0</span><h2>Provisioning tokens</h2><p>Create bearer tokens for enterprise directory provisioning. Tokens are shown once and stored only as hashes.</p></div></div>
        <div className="invite-row"><label>Token name<input value={scimName} onChange={(event) => setScimName(event.target.value)} /></label><span /><button className="button primary" type="button" disabled={createToken.isPending} onClick={() => createToken.mutate()}>Create token</button></div>
        {issuedToken ? <div className="development-token-box"><strong>Copy this token now</strong><code>{issuedToken}</code></div> : null}
        <div className="settings-list">{tokens.data?.map((token) => <article key={token.id} className="settings-list-row"><div><strong>{token.name}</strong><small>{token.key_prefix ?? token.keyPrefix} · last used {formatDate(token.last_used_at ?? null)}</small></div><button className="button secondary" type="button" disabled={Boolean(token.revoked_at) || revoke.isPending} onClick={() => revoke.mutate(token.id)}>{token.revoked_at ? 'Revoked' : 'Revoke'}</button></article>)}</div>
      </section>
    </div>
  );
}
function ComplianceSettings() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const canManage = auth.me?.principal.roles.some((role) => ['OWNER', 'ADMIN'].includes(role)) ?? false;
  const policy = useQuery({ queryKey: ['retention-policy'], queryFn: () => api.getRetentionPolicy(), enabled: canManage });
  const [recordingDays, setRecordingDays] = useState(30);
  const [transcriptDays, setTranscriptDays] = useState(90);
  const [auditDays, setAuditDays] = useState(365);
  const [deleteOnExpiry, setDeleteOnExpiry] = useState(true);
  const [legalHold, setLegalHold] = useState(false);

  useEffect(() => {
    if (!policy.data) return;
    setRecordingDays(policy.data.recordingDays);
    setTranscriptDays(policy.data.transcriptDays);
    setAuditDays(policy.data.auditDays);
    setDeleteOnExpiry(policy.data.deleteOnExpiry);
    setLegalHold(policy.data.legalHold);
  }, [policy.data]);

  const save = useMutation({
    mutationFn: () => api.saveRetentionPolicy({ recordingDays, transcriptDays, auditDays, deleteOnExpiry, legalHold }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['retention-policy'] }),
  });
  const auditExport = useMutation({
    mutationFn: () => api.exportAuditLog(),
    onSuccess: (result) => downloadCsv(result),
  });

  if (!canManage) return <SettingsError message="Owner or admin access is required to manage compliance settings." />;
  if (policy.isLoading) return <SettingsLoading />;
  if (policy.error) return <SettingsError message={policy.error.message} />;

  return (
    <div className="settings-stack">
      <section className="panel settings-panel">
        <div className="settings-panel-heading">
          <div>
            <span className="eyebrow">Data governance</span>
            <h2>Retention policy</h2>
            <p>Set workspace retention intent for recordings, transcripts, and audit evidence. New recordings consume the active workspace policy.</p>
          </div>
          {legalHold ? <span className="settings-role-chip">legal hold</span> : null}
        </div>
        <form className="settings-form" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
          <div className="settings-form-grid">
            <label>Recording retention (days)<input type="number" min={1} max={3650} value={recordingDays} onChange={(event) => setRecordingDays(Number(event.target.value))} /></label>
            <label>Transcript retention (days)<input type="number" min={1} max={3650} value={transcriptDays} onChange={(event) => setTranscriptDays(Number(event.target.value))} /></label>
            <label>Audit retention (days)<input type="number" min={30} max={3650} value={auditDays} onChange={(event) => setAuditDays(Number(event.target.value))} /></label>
          </div>
          <label className="settings-toggle-row"><input type="checkbox" checked={deleteOnExpiry} onChange={(event) => setDeleteOnExpiry(event.target.checked)} /><span><strong>Delete on expiry</strong><small>Marks expired governed artifacts for deletion when lifecycle workers enforce the policy.</small></span></label>
          <label className="settings-toggle-row"><input type="checkbox" checked={legalHold} onChange={(event) => setLegalHold(event.target.checked)} /><span><strong>Legal hold</strong><small>New recordings receive no automatic retention deadline while legal hold is enabled.</small></span></label>
          {save.error ? <div className="error-banner">{save.error.message}</div> : null}
          {save.isSuccess ? <div className="success-banner">Retention policy saved.</div> : null}
          <div className="settings-actions"><button className="button primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save retention policy'}</button></div>
        </form>
      </section>

      <section className="panel settings-panel">
        <div className="settings-panel-heading">
          <div><span className="eyebrow">Audit evidence</span><h2>Governed audit export</h2><p>Export the last 30 days of workspace audit activity as CSV. The export itself is recorded as an audit event.</p></div>
          <button className="button secondary" type="button" disabled={auditExport.isPending} onClick={() => auditExport.mutate()}>{auditExport.isPending ? 'Preparing…' : 'Export audit CSV'}</button>
        </div>
        {auditExport.error ? <div className="error-banner">{auditExport.error.message}</div> : null}
        {auditExport.data?.truncated ? <div className="warning-banner">The export reached the 10,000-row safety limit. Use a narrower date window through the API for a complete export.</div> : null}
        <div className="settings-policy-note">Exports are workspace-scoped and restricted to owner/admin roles.</div>
      </section>
    </div>
  );
}
function DomainSettings() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const canManage = auth.me?.principal.roles.some((role) => ['OWNER', 'ADMIN'].includes(role)) ?? false;
  const [hostname, setHostname] = useState('');

  const domains = useQuery({
    queryKey: ['custom-domains'],
    queryFn: () => api.listCustomDomains(),
    enabled: canManage,
  });

  const create = useMutation({
    mutationFn: () => api.createCustomDomain(hostname.trim()),
    onSuccess: async () => {
      setHostname('');
      await queryClient.invalidateQueries({ queryKey: ['custom-domains'] });
    },
  });
  const verify = useMutation({
    mutationFn: (id: string) => api.verifyCustomDomain(id),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['custom-domains'] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteCustomDomain(id),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['custom-domains'] }),
  });

  return (
    <div className="settings-stack">
      <section className="panel settings-panel">
        <div className="settings-panel-heading">
          <div>
            <span className="eyebrow">Branded routing</span>
            <h2>Custom domains</h2>
            <p>Map a verified customer hostname to this workspace. DNS ownership is checked before TLS provisioning is allowed to begin.</p>
          </div>
          <span className="count-pill">{domains.data?.length ?? 0}</span>
        </div>

        {!canManage ? <SettingsError message="Owner or admin access is required to manage custom domains." /> : null}
        {canManage ? (
          <>
            <form className="settings-form domain-create-form" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
              <div className="settings-form-grid">
                <label className="settings-grid-span">
                  Branded hostname
                  <input
                    required
                    minLength={4}
                    value={hostname}
                    onChange={(event) => setHostname(event.target.value.toLowerCase())}
                    placeholder="meet.example.com"
                  />
                  <small>Enter the hostname only — no https://, path, port, or wildcard.</small>
                </label>
              </div>
              <div className="settings-actions">
                <button className="button primary" disabled={create.isPending || !hostname.trim()}>
                  {create.isPending ? 'Adding…' : 'Add domain'}
                </button>
              </div>
            </form>
            {create.error ? <div className="error-banner">{create.error.message}</div> : null}

            {domains.isLoading ? <SettingsLoading /> : null}
            {domains.error ? <SettingsError message={domains.error.message} /> : null}
            <div className="domain-card-grid">
              {domains.data?.map((domain) => (
                <article className="domain-card" key={domain.id}>
                  <div className="domain-card-heading">
                    <div>
                      <strong>{domain.hostname}</strong>
                      <small>Added {formatDate(domain.createdAt)}</small>
                    </div>
                    <span className={`invitation-status ${domain.status === 'VERIFIED' || domain.status === 'ACTIVE' ? 'status-accepted' : ''}`}>
                      {domain.status.toLowerCase()}
                    </span>
                  </div>

                  <div className="domain-dns-grid">
                    <div>
                      <span>CNAME</span>
                      <code>{domain.dns.cname.name}</code>
                      <small>→</small>
                      <code>{domain.dns.cname.value}</code>
                    </div>
                    <div>
                      <span>TXT ownership proof</span>
                      <code>{domain.dns.txt.name}</code>
                      <small>value</small>
                      <code>{domain.dns.txt.value}</code>
                    </div>
                  </div>

                  <div className="domain-status-row">
                    <span><strong>DNS</strong><small>{domain.status.toLowerCase()}</small></span>
                    <span><strong>TLS</strong><small>{domain.tlsStatus.toLowerCase()}</small></span>
                    <span><strong>Last checked</strong><small>{formatDate(domain.lastCheckedAt)}</small></span>
                  </div>
                  {domain.lastError ? <div className="error-banner">{domain.lastError}</div> : null}
                  <div className="settings-actions">
                    <button type="button" className="button secondary" disabled={verify.isPending} onClick={() => verify.mutate(domain.id)}>
                      {verify.isPending ? 'Checking…' : 'Verify DNS'}
                    </button>
                    <button type="button" className="button secondary danger-text" disabled={remove.isPending} onClick={() => { if (window.confirm(`Remove ${domain.hostname}?`)) remove.mutate(domain.id); }}>
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {domains.data?.length === 0 ? <div className="settings-empty-row">No custom domains configured.</div> : null}
          </>
        ) : null}
      </section>

      <section className="panel settings-panel">
        <div className="settings-panel-heading compact-settings-heading"><div><span className="eyebrow">Provisioning contract</span><h2>DNS before TLS</h2></div></div>
        <p>Add both DNS records shown above, wait for propagation, then select Verify DNS. A verified domain enters the TLS provisioning queue; certificate issuance/routing remains provider infrastructure work and is intentionally not marked active until that layer confirms it.</p>
      </section>
    </div>
  );
}
function IntegrationsSettings() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const canManage = auth.me?.principal.roles.some((role) => ['OWNER', 'ADMIN'].includes(role)) ?? false;

  const connections = useQuery({
    queryKey: ['calendar-connections'],
    queryFn: () => api.listCalendarConnections(),
  });
  const apiKeys = useQuery({
    queryKey: ['integration-api-keys'],
    queryFn: () => api.listApiKeys(),
    enabled: canManage,
  });
  const webhooks = useQuery({
    queryKey: ['integration-webhooks'],
    queryFn: () => api.listWebhooks(),
    enabled: canManage,
  });

  const [apiKeyName, setApiKeyName] = useState('');
  const [apiKeyScopes, setApiKeyScopes] = useState<string[]>(['sessions:read']);
  const [apiKeyExpiry, setApiKeyExpiry] = useState('90');
  const [issuedApiKey, setIssuedApiKey] = useState<ApiKeyRecord | null>(null);
  const [webhookName, setWebhookName] = useState('');
  const [webhookEndpoint, setWebhookEndpoint] = useState('');
  const [webhookEvents, setWebhookEvents] = useState<string[]>(['session.started', 'session.ended']);
  const [issuedWebhook, setIssuedWebhook] = useState<WebhookSubscriptionRecord | null>(null);
  const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);

  const deliveries = useQuery({
    queryKey: ['webhook-deliveries', selectedWebhookId],
    queryFn: () => api.listWebhookDeliveries(selectedWebhookId!),
    enabled: Boolean(selectedWebhookId && canManage),
  });

  const connect = useMutation({
    mutationFn: (provider: 'GOOGLE' | 'MICROSOFT') => api.startCalendarOAuth(provider),
    onSuccess: (result) => window.location.assign(result.authorizationUrl),
  });
  const update = useMutation({
    mutationFn: ({ id, syncEnabled }: { id: string; syncEnabled: boolean }) =>
      api.updateCalendarConnection(id, { syncEnabled }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['calendar-connections'] }),
  });
  const disconnect = useMutation({
    mutationFn: (id: string) => api.disconnectCalendar(id),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['calendar-connections'] }),
  });
  const createApiKey = useMutation({
    mutationFn: () =>
      api.createApiKey({
        name: apiKeyName.trim(),
        scopes: apiKeyScopes,
        ...(apiKeyExpiry ? { expiresInDays: Number(apiKeyExpiry) } : {}),
      }),
    onSuccess: async (result) => {
      setIssuedApiKey(result);
      setApiKeyName('');
      await queryClient.invalidateQueries({ queryKey: ['integration-api-keys'] });
    },
  });
  const revokeApiKey = useMutation({
    mutationFn: (id: string) => api.revokeApiKey(id),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['integration-api-keys'] }),
  });
  const createWebhook = useMutation({
    mutationFn: () => api.createWebhook({
      name: webhookName.trim(),
      endpointUrl: webhookEndpoint.trim(),
      eventTypes: webhookEvents,
    }),
    onSuccess: async (result) => {
      setIssuedWebhook(result);
      setWebhookName('');
      setWebhookEndpoint('');
      await queryClient.invalidateQueries({ queryKey: ['integration-webhooks'] });
    },
  });
  const removeWebhook = useMutation({
    mutationFn: (id: string) => api.deleteWebhook(id),
    onSuccess: async (_, id) => {
      if (selectedWebhookId === id) setSelectedWebhookId(null);
      await queryClient.invalidateQueries({ queryKey: ['integration-webhooks'] });
    },
  });
  const reconcileWebhook = useMutation({
    mutationFn: (id: string) => api.reconcileWebhook(id, 24),
    onSuccess: async (_, id) => {
      await queryClient.invalidateQueries({ queryKey: ['webhook-deliveries', id] });
    },
  });
  const replayDelivery = useMutation({
    mutationFn: (id: string) => api.replayWebhookDelivery(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['webhook-deliveries', selectedWebhookId] });
    },
  });

  useEffect(() => {
    if (!searchParams.get('calendar')) return;
    void queryClient.invalidateQueries({ queryKey: ['calendar-connections'] });
    const next = new URLSearchParams(searchParams);
    next.delete('calendar');
    next.delete('reason');
    setSearchParams(next, { replace: true });
  }, [queryClient, searchParams, setSearchParams]);

  const byProvider = new Map((connections.data ?? []).map((connection) => [connection.provider, connection]));
  const scopeOptions = [
    'sessions:read', 'sessions:write', 'rooms:read', 'rooms:write',
    'events:read', 'events:write', 'bookings:read', 'bookings:write',
    'memory:read', 'analytics:read',
  ];
  const eventOptions = [
    'session.created', 'session.started', 'session.ended',
    'participant.joined', 'participant.left',
    'recording.ready', 'transcript.ready',
    'booking.created', 'booking.rescheduled', 'booking.cancelled',
    'event.registration.created', 'event.started', 'event.ended',
  ];

  return (
    <div className="settings-stack">
      <section className="panel settings-panel">
        <div className="settings-panel-heading">
          <div>
            <span className="eyebrow">Availability synchronization</span>
            <h2>Connected calendars</h2>
            <p>Connect Google or Microsoft Calendar so public booking slots automatically exclude busy time. Access and refresh tokens are encrypted before persistence.</p>
          </div>
        </div>
        {connections.isLoading ? <SettingsLoading /> : null}
        {connections.error ? <SettingsError message={connections.error.message} /> : null}
        <div className="workspace-directory-grid">
          {(['GOOGLE', 'MICROSOFT'] as const).map((provider) => {
            const connection = byProvider.get(provider);
            const label = provider === 'GOOGLE' ? 'Google Calendar' : 'Microsoft Calendar';
            return (
              <article className="workspace-directory-card" key={provider}>
                <span>{provider === 'GOOGLE' ? 'Google' : 'Microsoft 365'}</span>
                <h3>{label}</h3>
                {connection ? (
                  <>
                    <p>{connection.externalAccountEmail ?? 'Connected account'} · {connection.status.toLowerCase()}</p>
                    <small>{connection.lastSyncAt ? `Last checked ${formatDate(connection.lastSyncAt)}` : 'Busy-time synchronization has not run yet.'}</small>
                    {connection.lastError ? <div className="error-banner">{connection.lastError}</div> : null}
                    <label className="settings-toggle-row">
                      <input type="checkbox" checked={connection.syncEnabled} disabled={update.isPending || connection.status === 'REVOKED'} onChange={(event) => update.mutate({ id: connection.id, syncEnabled: event.target.checked })} />
                      <span><strong>Use for booking availability</strong><small>Busy intervals will be excluded from public slots.</small></span>
                    </label>
                    <button type="button" className="button secondary" disabled={disconnect.isPending} onClick={() => { if (window.confirm(`Disconnect ${label}?`)) disconnect.mutate(connection.id); }}>Disconnect</button>
                  </>
                ) : (
                  <>
                    <p>No account connected in this workspace.</p>
                    <button type="button" className="button primary" disabled={connect.isPending} onClick={() => connect.mutate(provider)}>Connect {label}</button>
                  </>
                )}
              </article>
            );
          })}
        </div>
        {connect.error ? <div className="error-banner">{connect.error.message}</div> : null}
        {update.error ? <div className="error-banner">{update.error.message}</div> : null}
        {disconnect.error ? <div className="error-banner">{disconnect.error.message}</div> : null}
      </section>

      <section className="panel settings-panel">
        <div className="settings-panel-heading">
          <div>
            <span className="eyebrow">Developer access</span>
            <h2>Workspace API keys</h2>
            <p>Create scoped credentials for automation. The full secret is shown once and only its hash is stored by the platform.</p>
          </div>
          <span className="count-pill">{apiKeys.data?.length ?? 0}</span>
        </div>
        {!canManage ? <SettingsError message="Owner or admin access is required to manage API keys." /> : null}
        {canManage ? (
          <>
            <form className="settings-form integration-create-form" onSubmit={(event) => { event.preventDefault(); createApiKey.mutate(); }}>
              <div className="settings-form-grid">
                <label>Key name<input required minLength={2} value={apiKeyName} onChange={(event) => setApiKeyName(event.target.value)} placeholder="Production automation" /></label>
                <label>Expires in days<input type="number" min={1} max={3650} value={apiKeyExpiry} onChange={(event) => setApiKeyExpiry(event.target.value)} /></label>
              </div>
              <div className="integration-chip-grid">
                {scopeOptions.map((scope) => (
                  <label className={apiKeyScopes.includes(scope) ? 'integration-chip selected' : 'integration-chip'} key={scope}>
                    <input type="checkbox" checked={apiKeyScopes.includes(scope)} onChange={(event) => setApiKeyScopes((current) => event.target.checked ? [...new Set([...current, scope])] : current.filter((item) => item !== scope))} />
                    {scope}
                  </label>
                ))}
              </div>
              <div className="settings-actions"><button className="button primary" disabled={createApiKey.isPending || !apiKeyName.trim() || apiKeyScopes.length === 0}>{createApiKey.isPending ? 'Creating…' : 'Create API key'}</button></div>
            </form>
            {issuedApiKey?.secret ? <div className="integration-secret-box"><strong>Copy this key now</strong><small>It will not be shown again.</small><code>{issuedApiKey.secret}</code><button type="button" className="button secondary" onClick={() => void navigator.clipboard.writeText(issuedApiKey.secret ?? '')}>Copy key</button></div> : null}
            {createApiKey.error ? <div className="error-banner">{createApiKey.error.message}</div> : null}
            <div className="settings-table integration-table">
              {apiKeys.data?.map((key) => (
                <div className="settings-table-row integration-row" key={key.id}>
                  <div className="member-copy"><strong>{key.name}</strong><span><code>{key.key_prefix}…</code> · {key.scopes.join(', ')}</span><small>Created {formatDate(key.created_at)} · Last used {formatDate(key.last_used_at)} · Expires {formatDate(key.expires_at)}</small></div>
                  <span className={`invitation-status ${key.revoked_at ? '' : 'status-accepted'}`}>{key.revoked_at ? 'revoked' : 'active'}</span>
                  <button type="button" className="settings-row-action danger-text" disabled={Boolean(key.revoked_at) || revokeApiKey.isPending} onClick={() => { if (window.confirm(`Revoke API key ${key.name}?`)) revokeApiKey.mutate(key.id); }}>Revoke</button>
                </div>
              ))}
              {apiKeys.data?.length === 0 ? <div className="settings-empty-row">No API keys have been created.</div> : null}
            </div>
          </>
        ) : null}
      </section>

      <section className="panel settings-panel">
        <div className="settings-panel-heading">
          <div>
            <span className="eyebrow">Event delivery</span>
            <h2>Signed webhooks</h2>
            <p>Deliver selected workspace events to an HTTPS endpoint using HMAC-SHA256 signatures, retries, delivery logs, replay, and reconciliation.</p>
          </div>
          <span className="count-pill">{webhooks.data?.length ?? 0}</span>
        </div>
        {canManage ? (
          <>
            <form className="settings-form integration-create-form" onSubmit={(event) => { event.preventDefault(); createWebhook.mutate(); }}>
              <div className="settings-form-grid">
                <label>Name<input required minLength={2} value={webhookName} onChange={(event) => setWebhookName(event.target.value)} placeholder="CRM events" /></label>
                <label>HTTPS endpoint<input required type="url" value={webhookEndpoint} onChange={(event) => setWebhookEndpoint(event.target.value)} placeholder="https://example.com/webhooks/sessions" /></label>
              </div>
              <div className="integration-chip-grid">
                {eventOptions.map((eventType) => (
                  <label className={webhookEvents.includes(eventType) ? 'integration-chip selected' : 'integration-chip'} key={eventType}>
                    <input type="checkbox" checked={webhookEvents.includes(eventType)} onChange={(event) => setWebhookEvents((current) => event.target.checked ? [...new Set([...current, eventType])] : current.filter((item) => item !== eventType))} />
                    {eventType}
                  </label>
                ))}
              </div>
              <div className="settings-actions"><button className="button primary" disabled={createWebhook.isPending || !webhookName.trim() || !webhookEndpoint.trim() || webhookEvents.length === 0}>{createWebhook.isPending ? 'Creating…' : 'Create webhook'}</button></div>
            </form>
            {issuedWebhook?.signingSecret ? <div className="integration-secret-box"><strong>Webhook signing secret</strong><small>Use this to verify the x-sessions-signature header. Copy it now.</small><code>{issuedWebhook.signingSecret}</code><button type="button" className="button secondary" onClick={() => void navigator.clipboard.writeText(issuedWebhook.signingSecret ?? '')}>Copy secret</button></div> : null}
            {createWebhook.error ? <div className="error-banner">{createWebhook.error.message}</div> : null}
            <div className="settings-table integration-table">
              {webhooks.data?.map((hook) => (
                <div className="settings-table-row webhook-row" key={hook.id}>
                  <div className="member-copy"><strong>{hook.name}</strong><span>{hook.endpoint_url}</span><small>{hook.event_types.join(', ')} · Last success {formatDate(hook.last_success_at)} · Last failure {formatDate(hook.last_failure_at)}</small></div>
                  <button type="button" className="settings-row-action" onClick={() => setSelectedWebhookId((current) => current === hook.id ? null : hook.id)}>{selectedWebhookId === hook.id ? 'Hide logs' : 'View logs'}</button>
                  <button type="button" className="settings-row-action" disabled={reconcileWebhook.isPending} onClick={() => reconcileWebhook.mutate(hook.id)}>Reconcile 24h</button>
                  <button type="button" className="settings-row-action danger-text" disabled={removeWebhook.isPending} onClick={() => { if (window.confirm(`Delete webhook ${hook.name}?`)) removeWebhook.mutate(hook.id); }}>Delete</button>
                </div>
              ))}
              {webhooks.data?.length === 0 ? <div className="settings-empty-row">No webhook subscriptions have been created.</div> : null}
            </div>
            {selectedWebhookId ? (
              <div className="webhook-delivery-panel">
                <div className="settings-panel-heading compact-settings-heading"><div><span className="eyebrow">Delivery history</span><h3>Recent attempts</h3></div></div>
                {deliveries.isLoading ? <SettingsLoading /> : null}
                {deliveries.error ? <SettingsError message={deliveries.error.message} /> : null}
                <div className="settings-table">
                  {deliveries.data?.map((delivery) => (
                    <div className="settings-table-row delivery-row" key={delivery.id}>
                      <div className="member-copy"><strong>{delivery.event_type}</strong><span>{delivery.status.toLowerCase()} · attempts {delivery.attempts}{delivery.response_status ? ` · HTTP ${delivery.response_status}` : ''}</span><small>{delivery.last_error ?? `Created ${formatDate(delivery.created_at)}`}</small></div>
                      <button type="button" className="settings-row-action" disabled={replayDelivery.isPending} onClick={() => replayDelivery.mutate(delivery.id)}>Replay</button>
                    </div>
                  ))}
                  {deliveries.data?.length === 0 ? <div className="settings-empty-row">No deliveries have been materialized yet.</div> : null}
                </div>
              </div>
            ) : null}
          </>
        ) : <SettingsError message="Owner or admin access is required to manage webhooks." />}
      </section>

      <section className="panel settings-panel">
        <div className="settings-panel-heading compact-settings-heading"><div><span className="eyebrow">Conflict policy</span><h2>How availability is calculated</h2></div></div>
        <p>Booking availability combines workspace booking rules, minimum notice, buffers, existing reservations, and busy intervals returned by each active connected calendar. A slot must pass every check before it can be reserved.</p>
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
