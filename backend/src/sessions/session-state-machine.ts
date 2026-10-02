import { SessionStatus } from '@prisma/client';

const SOURCES_BY_TARGET: Readonly<Partial<Record<SessionStatus, readonly SessionStatus[]>>> = {
  [SessionStatus.SCHEDULED]: [SessionStatus.DRAFT],
  [SessionStatus.LIVE]: [SessionStatus.DRAFT, SessionStatus.SCHEDULED],
  [SessionStatus.CANCELLED]: [SessionStatus.DRAFT, SessionStatus.SCHEDULED],
  [SessionStatus.ENDED]: [SessionStatus.LIVE],
  [SessionStatus.PROCESSING]: [SessionStatus.ENDED, SessionStatus.FAILED],
  [SessionStatus.READY]: [SessionStatus.PROCESSING],
  [SessionStatus.FAILED]: [SessionStatus.PROCESSING],
};

export function allowedSourceStatuses(target: SessionStatus): SessionStatus[] {
  return [...(SOURCES_BY_TARGET[target] ?? [])];
}

export function isSessionTransitionAllowed(
  current: SessionStatus,
  target: SessionStatus,
): boolean {
  return SOURCES_BY_TARGET[target]?.includes(current) ?? false;
}
