import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MarketingSite } from './MarketingSite';
import { PublicBookingPage } from './PublicBookingPage';
import { PublicEventPage } from './PublicEventPage';
import { resolveMarketingRoute } from './site-routes';
import './styles.css';
import './public.css';

function RoutedPage() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const [route, organizationSlug, workspaceSlug, resourceSlug, ...rest] = parts;
  const publicResource =
    rest.length === 0 &&
    organizationSlug !== undefined &&
    workspaceSlug !== undefined &&
    resourceSlug !== undefined;

  if (route === 'events' && publicResource) {
    return (
      <PublicEventPage
        organizationSlug={organizationSlug}
        workspaceSlug={workspaceSlug}
        eventSlug={resourceSlug}
      />
    );
  }

  if (route === 'book' && publicResource) {
    return (
      <PublicBookingPage
        organizationSlug={organizationSlug}
        workspaceSlug={workspaceSlug}
        bookingSlug={resourceSlug}
      />
    );
  }

  return <MarketingSite route={resolveMarketingRoute(window.location.pathname)} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RoutedPage />
  </StrictMode>,
);
