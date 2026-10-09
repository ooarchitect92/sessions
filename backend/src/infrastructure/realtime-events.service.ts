import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { AgendaItem } from '@prisma/client';
import { Subject } from 'rxjs';

export interface AgendaActivatedEvent {
  sessionId: string;
  agendaItem: AgendaItem;
  activatedAt: string;
}

export interface UserRealtimeEvent {
  userIds: string[];
  eventName: 'chat.message.created' | 'chat.reaction.updated';
  payload: unknown;
}

export interface SessionRealtimeEvent {
  sessionId: string;
  eventName:
    | 'chat.message.created'
    | 'chat.reaction.updated'
    | 'poll.created'
    | 'poll.launched'
    | 'poll.closed'
    | 'poll.results.updated'
    | 'question.created'
    | 'question.updated'
    | 'question.votes.updated'
    | 'whiteboard.operation.appended'
    | 'breakouts.updated'
    | 'breakouts.announcement'
    | 'cobrowse.updated'
    | 'memory.updated';
  payload: unknown;
}

/**
 * In-process bridge from committed application commands to the Socket.IO gateway.
 * A production multi-replica deployment must back this bridge with Redis/NATS so
 * every gateway instance observes the same committed event stream.
 */
@Injectable()
export class RealtimeEventsService implements OnModuleDestroy {
  private readonly agendaActivatedSubject = new Subject<AgendaActivatedEvent>();
  private readonly sessionEventSubject = new Subject<SessionRealtimeEvent>();
  private readonly userEventSubject = new Subject<UserRealtimeEvent>();

  readonly agendaActivated$ = this.agendaActivatedSubject.asObservable();
  readonly sessionEvents$ = this.sessionEventSubject.asObservable();
  readonly userEvents$ = this.userEventSubject.asObservable();

  publishAgendaActivated(event: AgendaActivatedEvent): void {
    this.agendaActivatedSubject.next(event);
  }

  publishSessionEvent(event: SessionRealtimeEvent): void {
    this.sessionEventSubject.next(event);
  }

  publishUserEvent(event: UserRealtimeEvent): void {
    this.userEventSubject.next(event);
  }

  onModuleDestroy(): void {
    this.agendaActivatedSubject.complete();
    this.sessionEventSubject.complete();
    this.userEventSubject.complete();
  }
}
