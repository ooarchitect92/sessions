import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { AgendaItem } from '@prisma/client';
import { Subject } from 'rxjs';

export interface AgendaActivatedEvent {
  sessionId: string;
  agendaItem: AgendaItem;
  activatedAt: string;
}

/**
 * In-process bridge from committed application commands to the Socket.IO gateway.
 * A production multi-replica deployment must back this bridge with Redis/NATS so
 * every gateway instance observes the same committed event stream.
 */
@Injectable()
export class RealtimeEventsService implements OnModuleDestroy {
  private readonly agendaActivatedSubject = new Subject<AgendaActivatedEvent>();

  readonly agendaActivated$ = this.agendaActivatedSubject.asObservable();

  publishAgendaActivated(event: AgendaActivatedEvent): void {
    this.agendaActivatedSubject.next(event);
  }

  onModuleDestroy(): void {
    this.agendaActivatedSubject.complete();
  }
}
