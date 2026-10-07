import manifest from './site-manifest.json';

export type MarketingRoute =
  | 'home'
  | 'product'
  | 'meetings'
  | 'webinars'
  | 'scheduling'
  | 'memory'
  | 'integrations'
  | 'security'
  | 'pricing'
  | 'contact'
  | 'about'
  | 'resources'
  | 'resource-agenda'
  | 'resource-webinars'
  | 'resource-scheduling'
  | 'search'
  | 'privacy'
  | 'accessibility'
  | 'consent'
  | 'offline'
  | 'error'
  | 'thank-you'
  | 'not-found';

export interface RouteDefinition {
  path: string;
  route: Exclude<MarketingRoute, 'not-found'>;
  title: string;
  description: string;
  index: boolean;
}

export const routeDefinitions = manifest.routes as RouteDefinition[];

function normalizePath(pathname: string): string {
  const raw = pathname.split('?')[0]?.split('#')[0] || '/';
  if (raw === '/') return '/';
  const normalized = raw.replace(/\/+$/, '');
  return normalized || '/';
}

export function resolveMarketingRoute(pathname: string): MarketingRoute {
  const path = normalizePath(pathname);
  return routeDefinitions.find((item) => item.path === path)?.route ?? 'not-found';
}

export function routeDefinitionFor(route: MarketingRoute): RouteDefinition | null {
  if (route === 'not-found') return null;
  return routeDefinitions.find((item) => item.route === route) ?? null;
}
