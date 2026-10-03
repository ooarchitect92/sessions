import type { AgendaItem } from '../api/client';

function contentString(
  content: Record<string, unknown>,
  key: string,
): string | null {
  const value = content[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

export function AgendaContentStage({ item }: { item: AgendaItem }) {
  const embedUrl =
    contentString(item.content, 'embedUrl') ?? contentString(item.content, 'url');
  const renderMode = contentString(item.content, 'renderMode');
  const text = contentString(item.content, 'text');

  if (item.type === 'TEXT') {
    return (
      <div className="shared-content-stage shared-note-stage">
        <div className="shared-content-heading">
          <span className="eyebrow">Shared agenda</span>
          <strong>{item.title}</strong>
        </div>
        <div className="shared-note-copy">
          {text ?? 'This discussion item is active for everyone in the session.'}
        </div>
      </div>
    );
  }

  if (
    !['WEBSITE', 'PRESENTATION', 'VIDEO'].includes(item.type) ||
    !embedUrl
  ) {
    return null;
  }

  return (
    <div className="shared-content-stage">
      <div className="shared-content-heading">
        <div>
          <span className="eyebrow">Shared content</span>
          <strong>{item.title}</strong>
        </div>
        <a href={contentString(item.content, 'url') ?? embedUrl} target="_blank" rel="noreferrer">
          Open separately ↗
        </a>
      </div>
      {item.type === 'VIDEO' && renderMode === 'video' ? (
        <video className="shared-video" controls src={embedUrl}>
          Your browser does not support embedded video.
        </video>
      ) : (
        <iframe
          className="shared-content-frame"
          src={embedUrl}
          title={item.title}
          sandbox="allow-forms allow-popups allow-presentation allow-scripts"
          allow="autoplay; fullscreen; picture-in-picture"
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  );
}
