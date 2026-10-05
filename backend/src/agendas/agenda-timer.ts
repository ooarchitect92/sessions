import { AgendaTimerStatus } from '@prisma/client';

export type AgendaTimerAction = 'START' | 'PAUSE' | 'RESET';

export interface AgendaTimerSnapshot {
  status: AgendaTimerStatus;
  remainingSeconds: number;
  endsAt: Date | null;
  startedAt: Date | null;
}

export function resolveAgendaTimerSnapshot(
  snapshot: AgendaTimerSnapshot,
  now: Date,
): AgendaTimerSnapshot {
  if (snapshot.status !== AgendaTimerStatus.RUNNING || !snapshot.endsAt) {
    return {
      ...snapshot,
      remainingSeconds: Math.max(0, snapshot.remainingSeconds),
    };
  }

  const remainingSeconds = Math.max(
    0,
    Math.ceil((snapshot.endsAt.getTime() - now.getTime()) / 1000),
  );

  if (remainingSeconds === 0) {
    return {
      status: AgendaTimerStatus.EXPIRED,
      remainingSeconds: 0,
      endsAt: snapshot.endsAt,
      startedAt: snapshot.startedAt,
    };
  }

  return {
    ...snapshot,
    remainingSeconds,
  };
}

export function transitionAgendaTimer(
  snapshot: AgendaTimerSnapshot,
  action: AgendaTimerAction,
  durationSeconds: number,
  now: Date,
): AgendaTimerSnapshot {
  const normalizedDuration = Math.max(0, Math.trunc(durationSeconds));
  const current = resolveAgendaTimerSnapshot(snapshot, now);

  if (action === 'RESET') {
    return {
      status: AgendaTimerStatus.IDLE,
      remainingSeconds: normalizedDuration,
      endsAt: null,
      startedAt: null,
    };
  }

  if (action === 'PAUSE') {
    if (current.status === AgendaTimerStatus.EXPIRED) return current;
    return {
      status:
        current.remainingSeconds === 0
          ? AgendaTimerStatus.EXPIRED
          : AgendaTimerStatus.PAUSED,
      remainingSeconds: current.remainingSeconds,
      endsAt: null,
      startedAt: current.startedAt,
    };
  }

  const remainingSeconds =
    current.remainingSeconds > 0
      ? current.remainingSeconds
      : normalizedDuration;

  if (remainingSeconds === 0) {
    return {
      status: AgendaTimerStatus.EXPIRED,
      remainingSeconds: 0,
      endsAt: null,
      startedAt: now,
    };
  }

  return {
    status: AgendaTimerStatus.RUNNING,
    remainingSeconds,
    endsAt: new Date(now.getTime() + remainingSeconds * 1000),
    startedAt: now,
  };
}
