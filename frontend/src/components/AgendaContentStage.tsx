import { useQuery } from '@tanstack/react-query';
import { api, type AgendaItem } from '../api/client';

function contentString(
  content: Record<string, unknown>,
  key: string,
): string | null {
  const value = content[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

export function AgendaContentStage({ item }: { item: AgendaItem }) {
  const fileId = contentString(item.content, 'fileId');
  const filename = contentString(item.content, 'filename');
  const mimeType = contentString(item.content, 'mimeType');
  const fileGrant = useQuery({
    queryKey: ['file-download-grant', fileId],
    queryFn: () => api.createFileDownloadGrant(fileId ?? ''),
    enabled: item.type === 'FILE' && Boolean(fileId),
    staleTime: 120_000,
  });

  const embedUrl =
    contentString(item.content, 'embedUrl') ?? contentString(item.content, 'url');
  const renderMode = contentString(item.content, 'renderMode');
  const text = contentString(item.content, 'text');


  if (item.type === 'FILE') {
    if (!fileId) return null;
    const url = fileGrant.data?.url ?? null;
    const isImage = mimeType?.startsWith('image/') ?? false;
    const isPdf = mimeType === 'application/pdf';

    return (
      <div className="shared-content-stage shared-file-stage">
        <div className="shared-content-heading">
          <div>
            <span className="eyebrow">Scanned file</span>
            <strong>{filename ?? item.title}</strong>
          </div>
          {url ? (
            <a href={url} target="_blank" rel="noreferrer">
              Download securely ↗
            </a>
          ) : null}
        </div>
        {fileGrant.isLoading ? (
          <div className="shared-file-placeholder">Preparing a secure file link…</div>
        ) : fileGrant.error ? (
          <div className="shared-file-placeholder error-state">
            {fileGrant.error.message}
          </div>
        ) : isImage && url ? (
          <img className="shared-file-image" src={url} alt={filename ?? item.title} />
        ) : isPdf && url ? (
          <iframe
            className="shared-content-frame"
            src={url}
            title={filename ?? item.title}
            sandbox="allow-downloads"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="shared-file-placeholder">
            <strong>{filename ?? item.title}</strong>
            <span>
              This malware-cleared file is available through a short-lived signed
              download link.
            </span>
            {url ? (
              <a className="button secondary" href={url} target="_blank" rel="noreferrer">
                Open file
              </a>
            ) : null}
          </div>
        )}
      </div>
    );
  }

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
