import type { PropsWithChildren } from 'react';
import { NavLink } from 'react-router-dom';

const navItems = [
  ['/', 'Overview', '⌂'],
  ['/rooms', 'Rooms', '▦'],
  ['/bookings', 'Bookings', '◷'],
  ['/events', 'Events', '◉'],
  ['/memory', 'Memory', '◇'],
  ['/analytics', 'Analytics', '↗'],
] as const;

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Sessions home">
          <span className="brand-mark">S</span>
          <span>
            <strong>Sessions</strong>
            <small>Product Team</small>
          </span>
        </a>
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
            <span>Phase 1</span>
            <strong>Active</strong>
          </div>
          <div className="usage-bar"><span style={{ width: '34%' }} /></div>
          <small>Tenant-safe meeting foundation</small>
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
          <div className="topbar-actions">
            <button className="icon-button" aria-label="Notifications">◌</button>
            <div className="avatar">LO</div>
          </div>
        </header>
        <div className="content-area">{children}</div>
      </main>
    </div>
  );
}
