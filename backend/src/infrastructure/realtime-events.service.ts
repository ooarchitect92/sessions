import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { AgendaItem } from '@prisma/client';
import { Subject } from 'rxjs';

export interface AgendaActivatedEvent {
  sessionId: string;
  agendaItem: AgendaItem;
  activatedAt: string;
}

export interface SessionRealtimeEvent {
  sessionId: string;
  eventName:
    | 'chat.message.created'
    | 'poll.created'
    | 'poll.launched'
    | 'poll.closed'
    | 'poll.results.updated'
    | 'question.created'
    | 'question.updated'
    | 'question.votes.updated'
    | 'memory.updated'
    | 'agenda.updated'
    | 'transcript.corrected'
    | 'memory.summary.updated'
    | 'memory.summary.approved'
    | 'memory.follow_up.generated'
    | 'memory.follow_up.updated'
    | 'memory.follow_up.approved'
    | 'memory.follow_up.delivery_requested';
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

  readonly agendaActivated$ = this.agendaActivatedSubject.asObservable();
  readonly sessionEvents$ = this.sessionEventSubject.asObservable();

  publishAgendaActivated(event: AgendaActivatedEvent): void {
    this.agendaActivatedSubject.next(event);
  }

  publishSessionEvent(event: SessionRealtimeEvent): void {
    this.sessionEventSubject.next(event);
  }

  onModuleDestroy(): void {
    this.agendaActivatedSubject.complete();
    this.sessionEventSubject.complete();
  }
}
