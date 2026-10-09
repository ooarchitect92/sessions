import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, type AgendaItem } from '../api/client';
import { useAuth } from '../auth/AuthContext';

function initialUrl(item: AgendaItem): string {
  const value = item.content.url;
  return typeof value === 'string' ? value.trim() : '';
}

export function CoBrowseStage({
  sessionId,
  item,
  sessionLive,
}: {
  sessionId: string;
  item: AgendaItem;
  sessionLive: boolean;
}) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState(() => initialUrl(item));
  const [selectedController, setSelectedController] = useState('');

  const currentUserId = auth.me?.principal.userId ?? '';
  const isHost =
    auth.me?.principal.roles.some((role) =>
      ['OWNER', 'ADMIN', 'HOST'].includes(role),
    ) ?? false;

  const state = useQuery({
    queryKey: ['cobrowse', sessionId],
    queryFn: () => api.getCobrowseState(sessionId),
    enabled: Boolean(sessionId),
  });

  useEffect(() => {
    if (state.data?.url) {
      setUrl(state.data.url);
    } else {
      setUrl(initialUrl(item));
    }
  }, [item, state.data?.url]);

  const participants = useQuery({
    queryKey: ['media-participants', sessionId, 'main'],
    queryFn: () => api.listMediaParticipants(sessionId),
    enabled: Boolean(isHost && state.data?.active),
    refetchInterval: state.data?.active ? 5000 : false,
  });

  const resolved = useQuery({
    queryKey: ['cobrowse-embed', state.data?.url],
    queryFn: () => api.resolveEmbed(state.data?.url ?? ''),
    enabled: Boolean(state.data?.active && state.data.url),
    staleTime: 10 * 60 * 1000,
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['cobrowse', sessionId] });
  };

  const start = useMutation({
    mutationFn: () => api.startCobrowse(sessionId, url.trim()),
    onSuccess: invalidate,
  });

  const navigate = useMutation({
    mutationFn: () => {
      if (!state.data?.active) throw new Error('Co-browsing is not active.');
      return api.navigateCobrowse(sessionId, state.data.version, url.trim());
    },
    onSuccess: invalidate,
  });

  const grant = useMutation({
    mutationFn: (controllerUserId: string) => {
      if (!state.data?.active) throw new Error('Co-browsing is not active.');
      return api.grantCobrowseControl(
        sessionId,
        state.data.version,
        controllerUserId,
      );
    },
    onSuccess: async (next) => {
      setSelectedController(next.controllerUserId ?? '');
      await invalidate();
    },
  });

  const stop = useMutation({
    mutationFn: () => {
      if (!state.data?.active) throw new Error('Co-browsing is not active.');
      return api.stopCobrowse(sessionId, state.data.version);
    },
    onSuccess: invalidate,
  });

  const participantNames = useMemo(
    () =>
      new Map(
        (participants.data?.participants ?? []).map((participant) => [
          participant.identity,
          participant.name,
        ]),
      ),
    [participants.data?.participants],
  );

  const controllerName = state.data?.controllerUserId
    ? state.data.controllerUserId === currentUserId
      ? 'You'
      : participantNames.get(state.data.controllerUserId) ?? 'Participant'
    : 'Host';

  const canNavigate =
    Boolean(state.data?.active) &&
    (isHost || state.data?.controllerUserId === currentUserId);

  const submitNavigation = (event: FormEvent) => {
    event.preventDefault();
    if (!url.trim()) return;
    if (state.data?.active) navigate.mutate();
    else start.mutate();
  };

  if (state.isLoading) {
    return <div className="content-stage-status">Loading co-browse session…</div>;
  }

  if (state.error || !state.data) {
    return (
      <div className="content-stage-placeholder error-state">
        <span className="eyebrow">Co-browse unavailable</span>
        <h2>{item.title}</h2>
        <p>{state.error?.message ?? 'Shared browsing state could not be loaded.'}</p>
      </div>
    );
  }

  if (!state.data.active) {
    return (
      <div className="cobrowse-stage cobrowse-idle">
        <div className="content-stage-placeholder">
          <span className="eyebrow">Shared product demo</span>
          <h2>{item.title}</h2>
          <p>
            The host starts a synchronized HTTPS page for everyone. Navigation can
            then be delegated to one connected participant with an explicit control
            grant.
          </p>
          {isHost ? (
            <form className="cobrowse-start-form" onSubmit={submitNavigation}>
              <input
                type="url"
                required
                placeholder="https://example.com/demo"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
              <button
                className="button primary"
                disabled={!sessionLive || start.isPending || !url.trim()}
              >
                {start.isPending ? 'Starting…' : 'Start co-browse'}
              </button>
            </form>
          ) : (
            <small>Waiting for a host to start the shared browser.</small>
          )}
          {!sessionLive && isHost ? (
            <small>Start the meeting before opening co-browse.</small>
          ) : null}
          {start.error ? <div className="error-banner">{start.error.message}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="cobrowse-stage">
      <div className="cobrowse-toolbar">
        <form onSubmit={submitNavigation}>
          <div className="cobrowse-address">
            <span aria-hidden="true">◎</span>
            <input
              type="url"
              required
              value={url}
              disabled={!canNavigate}
              onChange={(event) => setUrl(event.target.value)}
              aria-label="Shared co-browse URL"
            />
            <button
              type="submit"
              disabled={!canNavigate || navigate.isPending || !url.trim()}
            >
              {navigate.isPending ? 'Syncing…' : 'Go'}
            </button>
          </div>
        </form>

        <div className="cobrowse-control-strip">
          <span>
            Controller <strong>{controllerName}</strong>
          </span>
          {isHost ? (
            <>
              <select
                value={selectedController || state.data.controllerUserId || ''}
                disabled={grant.isPending || participants.isLoading}
                onChange={(event) => {
                  const controllerUserId = event.target.value;
                  setSelectedController(controllerUserId);
                  if (controllerUserId) grant.mutate(controllerUserId);
                }}
                aria-label="Co-browse controller"
              >
                <option value="">Choose controller…</option>
                {(participants.data?.participants ?? []).map((participant) => (
                  <option key={participant.identity} value={participant.identity}>
                    {participant.identity === currentUserId
                      ? `${participant.name} (you)`
                      : participant.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="cobrowse-stop"
                disabled={stop.isPending}
                onClick={() => stop.mutate()}
              >
                {stop.isPending ? 'Stopping…' : 'Stop'}
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="cobrowse-view">
        {resolved.isLoading ? (
          <div className="content-stage-status">Validating shared page…</div>
        ) : resolved.error || !resolved.data ? (
          <div className="content-stage-placeholder error-state">
            <span className="eyebrow">Shared page blocked</span>
            <h2>{item.title}</h2>
            <p>
              {resolved.error?.message ??
                'The current shared page could not be embedded safely.'}
            </p>
          </div>
        ) : (
          <>
            <div className="cobrowse-origin-note">
              <span>
                Synced page · {resolved.data.hostname} · controller {controllerName}
              </span>
              <a
                href={resolved.data.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                Open separately ↗
              </a>
            </div>
            <iframe
              key={resolved.data.embedUrl}
              title={`Co-browse: ${item.title}`}
              src={resolved.data.embedUrl}
              sandbox={resolved.data.sandbox}
              allow={resolved.data.allow}
              referrerPolicy={resolved.data.referrerPolicy}
              allowFullScreen
            />
          </>
        )}
      </div>

      <div className="cobrowse-safety-note">
        Shared URL navigation is synchronized and permissioned. Cross-origin click
        and typing control remains isolated by the browser sandbox until a governed
        remote-browser provider is configured.
      </div>

      {participants.error && isHost ? (
        <div className="error-banner compact-error">
          Connected participant list is temporarily unavailable, so control grants
          cannot be changed.
        </div>
      ) : null}
      {navigate.error ? <div className="error-banner">{navigate.error.message}</div> : null}
      {grant.error ? <div className="error-banner">{grant.error.message}</div> : null}
      {stop.error ? <div className="error-banner">{stop.error.message}</div> : null}
    </div>
  );
}
