import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkspaceRole } from '@sessions/contracts';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type WorkspaceMember } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const TABS = ['workspace', 'branding', 'members', 'workspaces', 'integrations', 'security'] as const;
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
                  : item === 'branding'
                    ? '✦'
                    : item === 'members'
                      ? '◎'
                      : item === 'workspaces'
                        ? '▦'
                        : item === 'integrations'
                          ? '⛓'
                          : '⌾'}
              </span>
              {item === 'workspace'
                ? 'Workspace profile'
                : item === 'branding'
                  ? 'Branding and domains'
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
          {tab === 'branding' ? <BrandingSettings /> : null}
          {tab === 'members' ? <MembersAndInvitations /> : null}
          {tab === 'workspaces' ? <WorkspaceDirectory /> : null}
          {tab === 'integrations' ? <IntegrationsSettings /> : null}
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

function BrandingSettings() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const currentRole = auth.me?.principal.roles[0] ?? 'GUEST';
  const canManage = ['OWNER', 'ADMIN'].includes(currentRole);

  const branding = useQuery({
    queryKey: ['workspace-branding'],
    queryFn: () => api.getWorkspaceBranding(),
  });
  const domains = useQuery({
    queryKey: ['custom-domains'],
    queryFn: () => api.listCustomDomains(),
    enabled: canManage,
  });

  const [displayName, setDisplayName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [faviconUrl, setFaviconUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#5B5FF5');
  const [accentColor, setAccentColor] = useState('#14B8A6');
  const [emailFromName, setEmailFromName] = useState('');
  const [supportUrl, setSupportUrl] = useState('');
  const [hideSessionsBranding, setHideSessionsBranding] = useState(false);
  const [hostname, setHostname] = useState('');

  useEffect(() => {
    if (!branding.data) return;
    setDisplayName(branding.data.displayName ?? '');
    setLogoUrl(branding.data.logoUrl ?? '');
    setFaviconUrl(branding.data.faviconUrl ?? '');
    setPrimaryColor(branding.data.primaryColor ?? '#5B5FF5');
    setAccentColor(branding.data.accentColor ?? '#14B8A6');
    setEmailFromName(branding.data.emailFromName ?? '');
    setSupportUrl(branding.data.supportUrl ?? '');
    setHideSessionsBranding(branding.data.hideSessionsBranding);
  }, [branding.data]);

  const saveBranding = useMutation({
    mutationFn: () =>
      api.updateWorkspaceBranding({
        displayName: displayName.trim() || null,
        logoUrl: logoUrl.trim() || null,
        faviconUrl: faviconUrl.trim() || null,
        primaryColor,
        accentColor,
        emailFromName: emailFromName.trim() || null,
        supportUrl: supportUrl.trim() || null,
        hideSessionsBranding,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workspace-branding'] });
    },
  });

  const addDomain = useMutation({
    mutationFn: () => api.createCustomDomain(hostname.trim()),
    onSuccess: async () => {
      setHostname('');
      await queryClient.invalidateQueries({ queryKey: ['custom-domains'] });
    },
  });

  const verifyDomain = useMutation({
    mutationFn: (domainId: string) => api.verifyCustomDomain(domainId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['custom-domains'] });
    },
  });

  const disableDomain = useMutation({
    mutationFn: (domainId: string) => api.disableCustomDomain(domainId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['custom-domains'] });
    },
  });

  if (branding.isLoading) return <SettingsLoading />;
  if (branding.error) return <SettingsError message={branding.error.message} />;

  return (
    <div className="settings-stack">
      <section className="panel settings-panel">
        <div className="settings-panel-heading">
          <div>
            <span className="eyebrow">Workspace identity</span>
            <h2>Brand appearance</h2>
            <p>
              Apply a workspace-owned identity to public and customer-facing experiences.
              Brand assets remain isolated to the current tenant.
            </p>
          </div>
          <span className="settings-role-chip">{currentRole.toLowerCase()}</span>
        </div>

        <form
          className="settings-form"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            saveBranding.mutate();
          }}
        >
          <div className="settings-form-grid">
            <label>
              Display name
              <input
                disabled={!canManage}
                maxLength={160}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Your company"
              />
            </label>
            <label>
              Email sender name
              <input
                disabled={!canManage}
                maxLength={160}
                value={emailFromName}
                onChange={(event) => setEmailFromName(event.target.value)}
                placeholder="Your company"
              />
            </label>
            <label className="settings-grid-span">
              Logo URL
              <input
                disabled={!canManage}
                type="url"
                value={logoUrl}
                onChange={(event) => setLogoUrl(event.target.value)}
                placeholder="https://cdn.example.com/logo.svg"
              />
            </label>
            <label className="settings-grid-span">
              Favicon URL
              <input
                disabled={!canManage}
                type="url"
                value={faviconUrl}
                onChange={(event) => setFaviconUrl(event.target.value)}
                placeholder="https://cdn.example.com/favicon.png"
              />
            </label>
            <label>
              Primary color
              <input
                disabled={!canManage}
                type="color"
                value={primaryColor}
                onChange={(event) => setPrimaryColor(event.target.value.toUpperCase())}
              />
            </label>
            <label>
              Accent color
              <input
                disabled={!canManage}
                type="color"
                value={accentColor}
                onChange={(event) => setAccentColor(event.target.value.toUpperCase())}
              />
            </label>
            <label className="settings-grid-span">
              Support URL
              <input
                disabled={!canManage}
                type="url"
                value={supportUrl}
                onChange={(event) => setSupportUrl(event.target.value)}
                placeholder="https://support.example.com"
              />
            </label>
          </div>

          <label className="settings-toggle-row">
            <input
              disabled={!canManage}
              type="checkbox"
              checked={hideSessionsBranding}
              onChange={(event) => setHideSessionsBranding(event.target.checked)}
            />
            <span>
              <strong>Hide Sessions branding</strong>
              <small>
                Remove the platform brand from customer-facing surfaces where white-label
                presentation is supported.
              </small>
            </span>
          </label>

          <div className="workspace-directory-grid">
            <article className="workspace-directory-card">
              <span>Live preview</span>
              <h3>{displayName.trim() || 'Your workspace'}</h3>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Brand logo preview"
                  style={{ maxWidth: '160px', maxHeight: '56px', objectFit: 'contain' }}
                />
              ) : (
                <p>Add an HTTPS logo URL to preview the brand asset.</p>
              )}
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <span
                  aria-label="Primary brand color"
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: primaryColor,
                  }}
                />
                <span
                  aria-label="Accent brand color"
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: accentColor,
                  }}
                />
              </div>
            </article>
          </div>

          {saveBranding.error ? (
            <div className="error-banner">{saveBranding.error.message}</div>
          ) : null}
          {saveBranding.isSuccess ? (
            <div className="success-banner">Brand settings saved.</div>
          ) : null}
          <div className="settings-actions">
            <button
              className="button primary"
              disabled={!canManage || saveBranding.isPending}
            >
              {saveBranding.isPending ? 'Saving…' : 'Save branding'}
            </button>
          </div>
        </form>
      </section>

      <section className="panel settings-panel">
        <div className="settings-panel-heading">
          <div>
            <span className="eyebrow">Verified customer hostnames</span>
            <h2>Custom domains</h2>
            <p>
              Prove DNS ownership first. After verification, the platform requests TLS
              provisioning through the infrastructure event pipeline.
            </p>
          </div>
          <span className="count-pill">{domains.data?.length ?? 0}</span>
        </div>

        <form
          className="invite-row"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            addDomain.mutate();
          }}
        >
          <input
            disabled={!canManage}
            required
            value={hostname}
            onChange={(event) => setHostname(event.target.value)}
            placeholder="meet.example.com"
          />
          <button
            className="button primary"
            disabled={!canManage || addDomain.isPending || hostname.trim().length < 4}
          >
            {addDomain.isPending ? 'Adding…' : 'Add domain'}
          </button>
        </form>

        {domains.isLoading ? <SettingsLoading /> : null}
        {domains.error ? <SettingsError message={domains.error.message} /> : null}
        {addDomain.error ? <div className="error-banner">{addDomain.error.message}</div> : null}
        {verifyDomain.error ? (
          <div className="error-banner">{verifyDomain.error.message}</div>
        ) : null}
        {disableDomain.error ? (
          <div className="error-banner">{disableDomain.error.message}</div>
        ) : null}

        <div className="settings-table">
          {domains.data?.map((domain) => (
            <div className="settings-table-row" key={domain.id}>
              <div className="member-copy">
                <strong>{domain.hostname}</strong>
                <span>
                  Domain {domain.status.toLowerCase().replaceAll('_', ' ')} · TLS{' '}
                  {domain.tlsStatus.toLowerCase().replaceAll('_', ' ')}
                </span>
                <small>
                  Last checked {formatDate(domain.lastCheckedAt)} · verified{' '}
                  {formatDate(domain.verifiedAt)}
                </small>
                <div className="development-token-box">
                  <div>
                    <strong>1. Ownership TXT record</strong>
                    <small>{domain.verification.type}</small>
                  </div>
                  <code>{domain.verification.name}</code>
                  <code>{domain.verification.value}</code>
                </div>
                <div className="development-token-box">
                  <div>
                    <strong>2. Routing record</strong>
                    <small>{domain.routing.type}</small>
                  </div>
                  <code>{domain.routing.name}</code>
                  <code>{domain.routing.value}</code>
                </div>
                {domain.lastError ? (
                  <div className="error-banner">{domain.lastError}</div>
                ) : null}
              </div>
              {domain.status !== 'DISABLED' && domain.status !== 'VERIFIED' ? (
                <button
                  type="button"
                  className="button primary"
                  disabled={!canManage || verifyDomain.isPending}
                  onClick={() => verifyDomain.mutate(domain.id)}
                >
                  Verify DNS
                </button>
              ) : null}
              {domain.status !== 'DISABLED' ? (
                <button
                  type="button"
                  className="settings-row-action danger-text"
                  disabled={!canManage || disableDomain.isPending}
                  onClick={() => {
                    if (window.confirm(`Disable ${domain.hostname}?`)) {
                      disableDomain.mutate(domain.id);
                    }
                  }}
                >
                  Disable
                </button>
              ) : null}
            </div>
          ))}
          {domains.data?.length === 0 ? (
            <div className="settings-empty-row">No custom domains configured.</div>
          ) : null}
        </div>
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

function IntegrationsSettings() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const connections = useQuery({
    queryKey: ['calendar-connections'],
    queryFn: () => api.listCalendarConnections(),
  });

  const connect = useMutation({
    mutationFn: (provider: 'GOOGLE' | 'MICROSOFT') =>
      api.startCalendarOAuth(provider),
    onSuccess: (result) => {
      window.location.assign(result.authorizationUrl);
    },
  });

  const update = useMutation({
    mutationFn: ({
      id,
      syncEnabled,
    }: {
      id: string;
      syncEnabled: boolean;
    }) => api.updateCalendarConnection(id, { syncEnabled }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['calendar-connections'] });
    },
  });

  const disconnect = useMutation({
    mutationFn: (id: string) => api.disconnectCalendar(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['calendar-connections'] });
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

  const byProvider = new Map(
    (connections.data ?? []).map((connection) => [
      connection.provider,
      connection,
    ]),
  );

  return (
    <div className="settings-stack">
      <section className="panel settings-panel">
        <div className="settings-panel-heading">
          <div>
            <span className="eyebrow">Availability synchronization</span>
            <h2>Connected calendars</h2>
            <p>
              Connect Google or Microsoft Calendar so public booking slots automatically
              exclude busy time. Access and refresh tokens are encrypted before persistence.
            </p>
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
                    <p>
                      {connection.externalAccountEmail ?? 'Connected account'} ·{' '}
                      {connection.status.toLowerCase()}
                    </p>
                    <small>
                      {connection.lastSyncAt
                        ? `Last checked ${formatDate(connection.lastSyncAt)}`
                        : 'Busy-time synchronization has not run yet.'}
                    </small>
                    {connection.lastError ? (
                      <div className="error-banner">{connection.lastError}</div>
                    ) : null}
                    <label className="settings-toggle-row">
                      <input
                        type="checkbox"
                        checked={connection.syncEnabled}
                        disabled={update.isPending || connection.status === 'REVOKED'}
                        onChange={(event) =>
                          update.mutate({
                            id: connection.id,
                            syncEnabled: event.target.checked,
                          })
                        }
                      />
                      <span>
                        <strong>Use for booking availability</strong>
                        <small>Busy intervals will be excluded from public slots.</small>
                      </span>
                    </label>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={disconnect.isPending}
                      onClick={() => {
                        if (window.confirm(`Disconnect ${label}?`)) {
                          disconnect.mutate(connection.id);
                        }
                      }}
                    >
                      Disconnect
                    </button>
                  </>
                ) : (
                  <>
                    <p>No account connected in this workspace.</p>
                    <button
                      type="button"
                      className="button primary"
                      disabled={connect.isPending}
                      onClick={() => connect.mutate(provider)}
                    >
                      Connect {label}
                    </button>
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
        <div className="settings-panel-heading compact-settings-heading">
          <div>
            <span className="eyebrow">Conflict policy</span>
            <h2>How availability is calculated</h2>
          </div>
        </div>
        <p>
          Booking availability combines workspace booking rules, minimum notice, buffers,
          existing reservations, and busy intervals returned by each active connected
          calendar. A slot must pass every check before it can be reserved.
        </p>
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
