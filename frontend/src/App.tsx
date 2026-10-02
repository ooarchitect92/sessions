import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { BookingsPage } from './pages/BookingsPage';
import { DashboardPage } from './pages/DashboardPage';
import { EventsPage } from './pages/EventsPage';
import { MemoryDetailPage } from './pages/MemoryDetailPage';
import { MemoryPage } from './pages/MemoryPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { RoomsPage } from './pages/RoomsPage';
import { SessionPage } from './pages/SessionPage';

function ShelledRoutes() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/rooms" element={<RoomsPage />} />
        <Route path="/bookings" element={<BookingsPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/memory" element={<MemoryPage />} />
        <Route
          path="/analytics"
          element={
            <PlaceholderPage
              title="Analytics"
              description="A governed event model, attendance intervals, aggregation jobs, and privacy controls will precede engagement dashboards."
            />
          }
        />
        <Route
          path="/settings"
          element={
            <PlaceholderPage
              title="Workspace settings"
              description="Invitations, branding, domains, integrations, security controls, and quotas are planned as dedicated modules."
            />
          }
        />
        <Route path="/404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </AppShell>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/sessions/:sessionId" element={<SessionPage />} />
      <Route path="/memory/:sessionId" element={<MemoryDetailPage />} />
      <Route path="/*" element={<ShelledRoutes />} />
    </Routes>
  );
}
