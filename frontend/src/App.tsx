import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { DashboardPage } from './pages/DashboardPage';
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
        <Route path="/bookings" element={<PlaceholderPage title="Booking pages" description="Availability rules, calendar OAuth, slot locking, intake forms, and timezone qualification are planned." />} />
        <Route path="/events" element={<PlaceholderPage title="Webinars and events" description="Public landing pages, registration, reminders, speaker roles, and attendance analytics are planned." />} />
        <Route path="/memory" element={<PlaceholderPage title="Meeting memory" description="Recording finalization, transcription, searchable artifacts, access controls, and retention must be completed first." />} />
        <Route path="/analytics" element={<PlaceholderPage title="Analytics" description="A governed event model and aggregation pipeline will precede engagement dashboards." />} />
        <Route path="/settings" element={<PlaceholderPage title="Workspace settings" description="Invitations, branding, domains, integrations, security controls, and quotas are planned as dedicated modules." />} />
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
      <Route path="/*" element={<ShelledRoutes />} />
    </Routes>
  );
}
