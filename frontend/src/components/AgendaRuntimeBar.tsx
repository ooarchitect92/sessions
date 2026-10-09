import { useEffect, useMemo, useState } from 'react';

function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function AgendaRuntimeBar({
  title,
  durationSeconds,
  activatedAt,
  position,
  itemCount,
  canControl,
  pending,
  onPrevious,
  onRestart,
  onNext,
}: {
  title: string;
  durationSeconds: number;
  activatedAt: string | null;
  position: number;
  itemCount: number;
  canControl: boolean;
  pending: boolean;
  onPrevious: () => void;
  onRestart: () => void;
  onNext: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!activatedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activatedAt]);

  const runtime = useMemo(() => {
    const started = activatedAt ? Date.parse(activatedAt) : Number.NaN;
    const elapsed = Number.isFinite(started)
      ? Math.max(0, Math.floor((now - started) / 1000))
      : 0;
    const remaining = durationSeconds - elapsed;
    const progress =
      durationSeconds > 0
        ? Math.min(100, Math.max(0, (elapsed / durationSeconds) * 100))
        : 100;
    return { elapsed, remaining, progress };
  }, [activatedAt, durationSeconds, now]);

  const overtime = runtime.remaining < 0;

  return (
    <section className={overtime ? 'agenda-runtime overtime' : 'agenda-runtime'}>
      <div className="agenda-runtime-copy">
        <span className="eyebrow">
          Agenda {position + 1} of {itemCount}
        </span>
        <strong>{title}</strong>
        <small>
          {activatedAt
            ? overtime
              ? `Over by ${formatDuration(Math.abs(runtime.remaining))}`
              : `${formatDuration(runtime.remaining)} remaining · ${formatDuration(
                  runtime.elapsed,
                )} elapsed`
            : 'Timer starts when the host activates this agenda item.'}
        </small>
      </div>

      <div className="agenda-runtime-meter" aria-hidden="true">
        <span style={{ width: `${runtime.progress}%` }} />
      </div>

      {canControl ? (
        <div className="agenda-runtime-actions" aria-label="Agenda navigation">
          <button
            type="button"
            disabled={pending || position <= 0}
            onClick={onPrevious}
          >
            Previous
          </button>
          <button type="button" disabled={pending} onClick={onRestart}>
            {activatedAt ? 'Restart timer' : 'Start timer'}
          </button>
          <button
            type="button"
            disabled={pending || position >= itemCount - 1}
            onClick={onNext}
          >
            Next
          </button>
        </div>
      ) : null}
    </section>
  );
}
