import { useState, type PropsWithChildren } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const navItems = [
  ['/', 'Overview', '⌂'],
  ['/rooms', 'Rooms', '▦'],
  ['/bookings', 'Bookings', '◷'],
  ['/events', 'Events', '◉'],
  ['/memory', 'Memory', '◇'],
  ['/analytics', 'Analytics', '↗'],
] as const;

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'U';
}

export function AppShell({ children }: PropsWithChildren) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [switchingWorkspaceId, setSwitchingWorkspaceId] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const currentWorkspace = auth.me?.workspaces.find(
    (workspace) => workspace.workspaceId === auth.me?.principal.workspaceId,
  );

  const switchWorkspace = async (workspaceId: string) => {
    if (workspaceId === currentWorkspace?.workspaceId) {
      setWorkspaceMenuOpen(false);
      return;
    }
    setSwitchingWorkspaceId(workspaceId);
    setWorkspaceError(null);
    try {
      await auth.switchWorkspace(workspaceId);
      setWorkspaceMenuOpen(false);
      navigate('/', { replace: true });
    } catch (caught: unknown) {
      setWorkspaceError(caught instanceof Error ? caught.message : 'Workspace switch failed');
    } finally {
      setSwitchingWorkspaceId(null);
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand workspace-brand-button"
          type="button"
          aria-expanded={workspaceMenuOpen}
          onClick={() => setWorkspaceMenuOpen((value) => !value)}
        >
          <span className="brand-mark">S</span>
          <span>
            <strong>Sessions</strong>
            <small>{currentWorkspace?.workspaceName ?? 'Workspace'}</small>
          </span>
          <span className="workspace-chevron">⌄</span>
        </button>
        {workspaceMenuOpen ? (
          <div className="workspace-switcher">
            <span className="workspace-switcher-label">Your workspaces</span>
            {auth.me?.workspaces.map((workspace) => (
              <button
                type="button"
                key={workspace.membershipId}
                className={workspace.workspaceId === currentWorkspace?.workspaceId ? 'active' : ''}
                disabled={switchingWorkspaceId !== null}
                onClick={() => void switchWorkspace(workspace.workspaceId)}
              >
                <span>{initials(workspace.workspaceName)}</span>
                <div>
                  <strong>{workspace.workspaceName}</strong>
                  <small>
                    {workspace.organizationName} · {workspace.role.toLowerCase()}
                  </small>
                </div>
                {switchingWorkspaceId === workspace.workspaceId ? <em>…</em> : null}
              </button>
            ))}
            {workspaceError ? <div className="workspace-switcher-error">{workspaceError}</div> : null}
            <NavLink to="/settings?tab=workspaces" onClick={() => setWorkspaceMenuOpen(false)}>
              Manage workspaces
            </NavLink>
          </div>
        ) : null}
        <nav aria-label="Primary navigation">
          {navItems.map(([to, label, icon]) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="workspace-usage">
          <div className="usage-title">
            <span>Foundation</span>
            <strong>Active</strong>
          </div>
          <div className="usage-bar">
            <span style={{ width: '52%' }} />
          </div>
          <small>Identity, meetings, events, bookings, and memory</small>
        </div>
        <NavLink to="/settings" className="nav-item">
          <span aria-hidden="true">⚙</span>
          Settings
        </NavLink>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="search-box">
            <span aria-hidden="true">⌕</span>
            <input aria-label="Search" placeholder="Search sessions, people, or memory" />
            <kbd>⌘ K</kbd>
          </div>
          <div className="topbar-actions profile-menu-wrap">
            <button className="icon-button" aria-label="Notifications">
              ◌
            </button>
            <button
              type="button"
              className="avatar avatar-button"
              aria-expanded={profileMenuOpen}
              onClick={() => setProfileMenuOpen((value) => !value)}
            >
              {initials(auth.me?.profile.displayName ?? 'User')}
            </button>
            {profileMenuOpen ? (
              <div className="profile-menu">
                <div>
                  <strong>{auth.me?.profile.displayName}</strong>
                  <span>{auth.me?.profile.email}</span>
                </div>
                <NavLink to="/settings?tab=security" onClick={() => setProfileMenuOpen(false)}>
                  Security and sessions
                </NavLink>
                <button
                  type="button"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    void auth.signOut();
                  }}
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </header>
        <div className="content-area">{children}</div>
      </main>
    </div>
  );
}
