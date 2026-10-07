import { useQuery } from '@tanstack/react-query';
import { api, type AgendaItem } from '../api/client';

const EMBED_TYPES = new Set(['WEBSITE', 'VIDEO', 'PRESENTATION']);

function contentUrl(item: AgendaItem): string | null {
  const value = item.content.url;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function uploadId(item: AgendaItem): string | null {
  const value = item.content.uploadId;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function AgendaContentStage({ item }: { item: AgendaItem }) {
  const url = EMBED_TYPES.has(item.type) ? contentUrl(item) : null;
  const assetId = EMBED_TYPES.has(item.type) ? uploadId(item) : null;

  const upload = useQuery({
    queryKey: ['agenda-upload', assetId],
    queryFn: () => api.getUpload(assetId ?? ''),
    enabled: Boolean(assetId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'PENDING_SCAN' || status === 'SCANNING' ? 1500 : false;
    },
  });

  const download = useQuery({
    queryKey: ['agenda-upload-download', assetId],
    queryFn: () => api.createUploadDownloadGrant(assetId ?? ''),
    enabled: Boolean(assetId && upload.data?.status === 'READY'),
    staleTime: 4 * 60 * 1000,
  });

  const resolved = useQuery({
    queryKey: ['agenda-embed', url],
    queryFn: () => api.resolveEmbed(url ?? ''),
    enabled: Boolean(url && !assetId),
    staleTime: 10 * 60 * 1000,
  });

  if (assetId) {
    if (
      upload.isLoading ||
      upload.data?.status === 'PENDING_SCAN' ||
      upload.data?.status === 'SCANNING'
    ) {
      return (
        <div className="content-stage-status">
          Scanning shared file before it can be displayed…
        </div>
      );
    }

    if (
      upload.error ||
      !upload.data ||
      upload.data.status === 'REJECTED' ||
      upload.data.status === 'FAILED' ||
      upload.data.status === 'DELETED'
    ) {
      return (
        <div className="content-stage-placeholder error-state">
          <span className="eyebrow">Shared file unavailable</span>
          <h2>{item.title}</h2>
          <p>
            {upload.error?.message ??
              upload.data?.scanResult ??
              'This file did not pass the secure upload pipeline.'}
          </p>
        </div>
      );
    }

    if (download.isLoading || !download.data) {
      return <div className="content-stage-status">Preparing secure file access…</div>;
    }

    if (download.error) {
      return (
        <div className="content-stage-placeholder error-state">
          <span className="eyebrow">Shared file unavailable</span>
          <h2>{item.title}</h2>
          <p>{download.error.message}</p>
        </div>
      );
    }

    const mime = upload.data.mimeType;
    const isImage = mime.startsWith('image/');
    const isVideo = mime.startsWith('video/');
    const isAudio = mime.startsWith('audio/');
    const isPdf = mime === 'application/pdf';

    return (
      <div className="agenda-content-stage uploaded-content-stage">
        <div className="agenda-content-meta">
          <div>
            <strong>{item.title}</strong>
            <span>
              Secure upload · {upload.data.filename} · scanned by{' '}
              {upload.data.scanProvider ?? 'scanner'}
            </span>
          </div>
          <a href={download.data.url} target="_blank" rel="noreferrer noopener">
            Download ↗
          </a>
        </div>
        <div className="uploaded-content-viewer">
          {isImage ? (
            <img src={download.data.url} alt={item.title} />
          ) : isVideo ? (
            <video src={download.data.url} controls playsInline />
          ) : isAudio ? (
            <audio src={download.data.url} controls />
          ) : isPdf ? (
            <iframe
              title={item.title}
              src={download.data.url}
              sandbox="allow-scripts allow-same-origin"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="content-stage-placeholder">
              <span className="eyebrow">Secure attachment</span>
              <h2>{upload.data.filename}</h2>
              <p>
                This file passed malware scanning. Download it to open it in its native
                application.
              </p>
              <a className="button primary" href={download.data.url}>
                Download file
              </a>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!url) {
    return (
      <div className="content-stage-placeholder">
        <span className="eyebrow">Shared content</span>
        <h2>{item.title}</h2>
        <p>
          This agenda item does not contain an embeddable HTTPS URL or secure uploaded
          file yet.
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
