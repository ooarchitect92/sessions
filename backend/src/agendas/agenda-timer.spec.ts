import { AgendaTimerStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  resolveAgendaTimerSnapshot,
  transitionAgendaTimer,
  type AgendaTimerSnapshot,
} from './agenda-timer';

const base: AgendaTimerSnapshot = {
  status: AgendaTimerStatus.IDLE,
  remainingSeconds: 300,
  endsAt: null,
  startedAt: null,
};

describe('agenda timer state', () => {
  it('starts from the current remaining duration', () => {
    const now = new Date('2026-10-03T10:00:00.000Z');
    const next = transitionAgendaTimer(base, 'START', 300, now);

    expect(next.status).toBe(AgendaTimerStatus.RUNNING);
    expect(next.remainingSeconds).toBe(300);
    expect(next.endsAt?.toISOString()).toBe('2026-10-03T10:05:00.000Z');
  });

  it('pauses using the server clock instead of trusting the client', () => {
    const startedAt = new Date('2026-10-03T10:00:00.000Z');
    const running: AgendaTimerSnapshot = {
      status: AgendaTimerStatus.RUNNING,
      remainingSeconds: 300,
      endsAt: new Date('2026-10-03T10:05:00.000Z'),
      startedAt,
    };

    const next = transitionAgendaTimer(
      running,
      'PAUSE',
      300,
      new Date('2026-10-03T10:01:31.000Z'),
    );

    expect(next.status).toBe(AgendaTimerStatus.PAUSED);
    expect(next.remainingSeconds).toBe(209);
    expect(next.endsAt).toBeNull();
    expect(next.startedAt).toEqual(startedAt);
  });

  it('resets to the agenda item duration', () => {
    const running: AgendaTimerSnapshot = {
      status: AgendaTimerStatus.RUNNING,
      remainingSeconds: 90,
      endsAt: new Date('2026-10-03T10:01:30.000Z'),
      startedAt: new Date('2026-10-03T10:00:00.000Z'),
    };

    const next = transitionAgendaTimer(
      running,
      'RESET',
      420,
      new Date('2026-10-03T10:00:30.000Z'),
    );

    expect(next).toEqual({
      status: AgendaTimerStatus.IDLE,
      remainingSeconds: 420,
      endsAt: null,
      startedAt: null,
    });
  });

  it('derives expiration when the persisted end time passes', () => {
    const next = resolveAgendaTimerSnapshot(
      {
        status: AgendaTimerStatus.RUNNING,
        remainingSeconds: 15,
        endsAt: new Date('2026-10-03T10:00:15.000Z'),
        startedAt: new Date('2026-10-03T10:00:00.000Z'),
      },
      new Date('2026-10-03T10:00:16.000Z'),
    );

    expect(next.status).toBe(AgendaTimerStatus.EXPIRED);
    expect(next.remainingSeconds).toBe(0);
  });
});
