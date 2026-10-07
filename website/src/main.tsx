import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MarketingSite } from './MarketingSite';
import { PublicBookingPage } from './PublicBookingPage';
import { PublicEventPage } from './PublicEventPage';
import type { MarketingRoute } from './marketing-data';
import './styles.css';
import './public.css';

const routes: Record<string, MarketingRoute> = {
  '':'home', product:'product', meetings:'meetings', webinars:'webinars',
  scheduling:'scheduling', memory:'memory', integrations:'integrations',
  security:'security', pricing:'pricing', contact:'contact',
};

function RoutedPage() {
  const parts=window.location.pathname.split('/').filter(Boolean);
  const [route,organizationSlug,workspaceSlug,resourceSlug,...rest]=parts;
  const publicResource=rest.length===0&&organizationSlug!==undefined&&workspaceSlug!==undefined&&resourceSlug!==undefined;
  if(route==='events'&&publicResource) return <PublicEventPage organizationSlug={organizationSlug} workspaceSlug={workspaceSlug} eventSlug={resourceSlug}/>;
  if(route==='book'&&publicResource) return <PublicBookingPage organizationSlug={organizationSlug} workspaceSlug={workspaceSlug} bookingSlug={resourceSlug}/>;
  const marketingRoute=routes[parts.length===0?'':route??''];
  return <MarketingSite route={marketingRoute&&parts.length<=1?marketingRoute:'home'}/>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><RoutedPage/></StrictMode>);
