import { SessionStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  allowedSourceStatuses,
  isSessionTransitionAllowed,
} from './session-state-machine';

describe('session state machine', () => {
  it('allows a draft or scheduled session to go live', () => {
    expect(allowedSourceStatuses(SessionStatus.LIVE)).toEqual([
      SessionStatus.DRAFT,
      SessionStatus.SCHEDULED,
    ]);
    expect(isSessionTransitionAllowed(SessionStatus.DRAFT, SessionStatus.LIVE)).toBe(true);
  });

  it('does not allow a completed session to restart directly', () => {
    expect(isSessionTransitionAllowed(SessionStatus.ENDED, SessionStatus.LIVE)).toBe(false);
    expect(isSessionTransitionAllowed(SessionStatus.READY, SessionStatus.LIVE)).toBe(false);
  });

  it('requires processing before memory becomes ready', () => {
    expect(isSessionTransitionAllowed(SessionStatus.ENDED, SessionStatus.READY)).toBe(false);
    expect(isSessionTransitionAllowed(SessionStatus.PROCESSING, SessionStatus.READY)).toBe(true);
  });
});
