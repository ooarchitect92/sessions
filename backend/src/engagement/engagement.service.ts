import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Principal } from '../common/auth/principal';

export const ENGAGEMENT_EVENT = {
  PARTICIPANT_JOINED: 'participant.joined',
  PARTICIPANT_LEFT: 'participant.left',
  CHAT_MESSAGE_SENT: 'chat.message.sent',
  POLL_ANSWERED: 'poll.answered',
  QUESTION_SUBMITTED: 'question.submitted',
  QUESTION_VOTED: 'question.voted',
  WHITEBOARD_CHANGED: 'whiteboard.changed',
} as const;

export type EngagementEventType =
  (typeof ENGAGEMENT_EVENT)[keyof typeof ENGAGEMENT_EVENT];

@Injectable()
export class EngagementService {
  async record(
    transaction: Prisma.TransactionClient,
    principal: Pick<
      Principal,
      'organizationId' | 'workspaceId' | 'userId'
    >,
    event: {
      sessionId: string;
      eventType: EngagementEventType;
      sourceType?: string;
      sourceId?: string;
      properties?: Prisma.InputJsonValue;
      occurredAt?: Date;
      actorUserId?: string | null;
    },
  ) {
    return transaction.engagementEvent.create({
      data: {
        organizationId: principal.organizationId,
        workspaceId: principal.workspaceId,
        sessionId: event.sessionId,
        actorUserId:
          event.actorUserId === undefined ? principal.userId : event.actorUserId,
        eventType: event.eventType,
        sourceType: event.sourceType ?? null,
        sourceId: event.sourceId ?? null,
        properties: event.properties ?? {},
        occurredAt: event.occurredAt ?? new Date(),
      },
    });
  }
}
