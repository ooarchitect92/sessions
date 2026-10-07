import { useQuery } from '@tanstack/react-query';
import { api, type AgendaItem } from '../api/client';

const EMBED_TYPES = new Set(['WEBSITE', 'VIDEO', 'PRESENTATION']);

function contentUrl(item: AgendaItem): string | null {
  const value = item.content.url;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function AgendaContentStage({ item }: { item: AgendaItem }) {
  const url = EMBED_TYPES.has(item.type) ? contentUrl(item) : null;
  const resolved = useQuery({
    queryKey: ['agenda-embed', url],
    queryFn: () => api.resolveEmbed(url ?? ''),
    enabled: Boolean(url),
    staleTime: 10 * 60 * 1000,
  });

  if (!url) {
    return (
      <div className="content-stage-placeholder">
        <span className="eyebrow">Shared content</span>
        <h2>{item.title}</h2>
        <p>
          This agenda item does not contain an embeddable HTTPS URL yet. Add a website,
          video, or presentation link to show it on the shared stage.
        </p>
      </div>
    );
  }

  if (resolved.isLoading) {
    return <div className="content-stage-status">Validating shared content…</div>;
  }

  if (resolved.error || !resolved.data) {
    return (
      <div className="content-stage-placeholder error-state">
        <span className="eyebrow">Shared content blocked</span>
        <h2>{item.title}</h2>
        <p>{resolved.error?.message ?? 'The embed could not be resolved safely.'}</p>
      </div>
    );
  }

  return (
    <div className="agenda-content-stage">
      <div className="agenda-content-meta">
        <div>
          <strong>{item.title}</strong>
          <span>
            {resolved.data.provider} · {resolved.data.hostname}
          </span>
        </div>
        <a href={resolved.data.sourceUrl} target="_blank" rel="noreferrer noopener">
          Open separately ↗
        </a>
      </div>
      <iframe
        title={item.title}
        src={resolved.data.embedUrl}
        sandbox={resolved.data.sandbox}
        allow={resolved.data.allow}
        referrerPolicy={resolved.data.referrerPolicy}
        allowFullScreen
      />
    </div>
  );
}
