import type { AgendaItem } from '../api/client';

function contentString(
  content: Record<string, unknown>,
  key: string,
): string | null {
  const value = content[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function youtubeEmbed(url: URL): string | null {
  if (url.hostname === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (
    url.hostname === 'www.youtube.com' ||
    url.hostname === 'youtube.com' ||
    url.hostname === 'm.youtube.com'
  ) {
    if (url.pathname.startsWith('/embed/')) {
      return `https://www.youtube-nocookie.com${url.pathname}`;
    }
    const id = url.searchParams.get('v');
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  return null;
}

function vimeoEmbed(url: URL): string | null {
  if (url.hostname !== 'vimeo.com' && url.hostname !== 'www.vimeo.com') return null;
  const id = url.pathname.split('/').filter(Boolean)[0];
  return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
}

function resolvedEmbedUrl(item: AgendaItem): string | null {
  const raw = contentString(item.content, 'url');
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    if (item.type === 'VIDEO') {
      return youtubeEmbed(url) ?? vimeoEmbed(url) ?? url.toString();
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function AgendaContentStage({
  item,
  onShowMedia,
}: {
  item: AgendaItem;
  onShowMedia: () => void;
}) {
  const text = contentString(item.content, 'text');
  const url = resolvedEmbedUrl(item);
  const label = item.type.toLowerCase().replace('_', ' ');

  return (
    <div className="agenda-content-stage">
      <div className="agenda-content-toolbar">
        <div>
          <span className="eyebrow">Shared agenda content</span>
          <strong>{item.title}</strong>
          <small>{label}</small>
        </div>
        <button className="button secondary" type="button" onClick={onShowMedia}>
          Show media
        </button>
      </div>

      {item.type === 'TEXT' ? (
        <article className="agenda-text-content">
          {text ? <p>{text}</p> : <p>No discussion notes were attached.</p>}
        </article>
      ) : null}

      {url ? (
        <iframe
          className="agenda-embed-frame"
          title={item.title}
          src={url}
          sandbox="allow-scripts allow-forms allow-popups allow-presentation"
          allow="autoplay; fullscreen; picture-in-picture"
          referrerPolicy="no-referrer"
          allowFullScreen
        />
      ) : null}

      {!url && item.type !== 'TEXT' ? (
        <div className="agenda-content-empty">
          <span>◇</span>
          <h3>No embeddable content attached</h3>
          <p>This agenda item is active, but it does not contain a valid HTTPS URL.</p>
        </div>
      ) : null}
    </div>
  );
}
