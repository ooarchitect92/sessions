import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const manifest = JSON.parse(await readFile(path.join(root, 'src', 'site-manifest.json'), 'utf8'));
const template = await readFile(path.join(dist, 'index.html'), 'utf8');
const siteUrl = (process.env.VITE_SITE_URL || 'http://localhost:3001').replace(/\/$/, '');

const escapeHtml = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

function render(route) {
  const canonical = `${siteUrl}${route.path === '/' ? '' : route.path}`;
  let html = template
    .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(route.title)}</title>`)
    .replace(
      /<meta name="description" content="[^"]*" \/>/,
      `<meta name="description" content="${escapeHtml(route.description)}" />`,
    )
    .replace(
      /<meta property="og:title" content="[^"]*" \/>/,
      `<meta property="og:title" content="${escapeHtml(route.title)}" />`,
    )
    .replace(
      /<meta property="og:description" content="[^"]*" \/>/,
      `<meta property="og:description" content="${escapeHtml(route.description)}" />`,
    )
    .replace(
      /<meta name="robots" content="[^"]*" \/>/,
      `<meta name="robots" content="${route.index ? 'index,follow' : 'noindex,follow'}" />`,
    );

  html = html.replace(
    '</head>',
    `    <link rel="canonical" href="${escapeHtml(canonical)}" />\n    <meta property="og:url" content="${escapeHtml(canonical)}" />\n  </head>`,
  );
  return html;
}

for (const route of manifest.routes) {
  const target =
    route.path === '/'
      ? path.join(dist, 'index.html')
      : path.join(dist, route.path.replace(/^\//, ''), 'index.html');
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, render(route), 'utf8');
}

const notFound = render({
  path: '/404',
  title: 'Page not found — Sessions',
  description: 'The requested Sessions page could not be found.',
  index: false,
});
await writeFile(path.join(dist, '404.html'), notFound, 'utf8');

const sitemapEntries = manifest.routes
  .filter((route) => route.index)
  .map((route) => `  <url><loc>${siteUrl}${route.path === '/' ? '' : route.path}</loc></url>`)
  .join('\n');
await writeFile(
  path.join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries}\n</urlset>\n`,
  'utf8',
);
await writeFile(
  path.join(dist, 'robots.txt'),
  `User-agent: *\nAllow: /\nDisallow: /search\nDisallow: /consent\nDisallow: /error\nDisallow: /offline\nSitemap: ${siteUrl}/sitemap.xml\n`,
  'utf8',
);
