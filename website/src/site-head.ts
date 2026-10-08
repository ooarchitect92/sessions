import { routeDefinitionFor, type MarketingRoute } from './site-routes';

const siteUrl = (import.meta.env.VITE_SITE_URL ?? window.location.origin).replace(/\/$/, '');

function ensureMeta(selector: string, attribute: 'name' | 'property', key: string): HTMLMetaElement {
  let node = document.querySelector<HTMLMetaElement>(selector);
  if (!node) {
    node = document.createElement('meta');
    node.setAttribute(attribute, key);
    document.head.appendChild(node);
  }
  return node;
}

function ensureCanonical(): HTMLLinkElement {
  let node = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!node) {
    node = document.createElement('link');
    node.rel = 'canonical';
    document.head.appendChild(node);
  }
  return node;
}

export function applyHead(input: {
  title: string;
  description: string;
  path: string;
  index?: boolean;
}): void {
  document.title = input.title;
  ensureMeta('meta[name="description"]', 'name', 'description').content = input.description;
  ensureMeta('meta[property="og:title"]', 'property', 'og:title').content = input.title;
  ensureMeta('meta[property="og:description"]', 'property', 'og:description').content =
    input.description;
  ensureMeta('meta[property="og:url"]', 'property', 'og:url').content =
    `${siteUrl}${input.path === '/' ? '' : input.path}`;
  ensureMeta('meta[name="robots"]', 'name', 'robots').content =
    input.index === false ? 'noindex,follow' : 'index,follow';
  ensureCanonical().href = `${siteUrl}${input.path === '/' ? '' : input.path}`;
}

export function applyMarketingHead(route: MarketingRoute): void {
  const definition = routeDefinitionFor(route);
  if (!definition) {
    applyHead({
      title: 'Page not found — Sessions',
      description: 'The requested Sessions page could not be found.',
      path: window.location.pathname,
      index: false,
    });
    return;
  }
  applyHead(definition);
}
