import { Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { AgendaItem } from "@prisma/client";
import type { Server, Socket } from "socket.io";
import type { Subscription } from "rxjs";
import { z } from "zod";
import { AgendasService } from "../agendas/agendas.service";
import { AnalyticsService } from "../analytics/analytics.service";
import { CaptionsService } from "../captions/captions.service";
import { AuthService } from "../auth/auth.service";
import type { AccessTokenClaims, Principal } from "../common/auth/principal";
import { RealtimeEventsService } from "../infrastructure/realtime-events.service";
import { SessionsService } from "../sessions/sessions.service";

const principalSchema = z.object({
  sub: z.string().uuid(),
  organizationId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1).max(160),
  roles: z
    .array(z.enum(["OWNER", "ADMIN", "HOST", "MEMBER", "ANALYST", "GUEST"]))
    .min(1),
  sid: z.string().uuid().optional(),
});

const joinSchema = z.object({ sessionId: z.string().uuid() });
const captionSchema = z.object({
  sessionId: z.string().uuid(),
  sequence: z.number().int().min(0).max(2_000_000_000),
  text: z.string().min(1).max(4000),
  isFinal: z.boolean(),
  startMs: z.number().int().min(0).max(86_400_000).optional(),
  endMs: z.number().int().min(0).max(86_400_000).optional(),
  speakerLabel: z.string().min(1).max(160).optional(),
  language: z.string().min(2).max(32).optional(),
  source: z.string().min(1).max(80).optional(),
});
const activateSchema = z.object({
  sessionId: z.string().uuid(),
  agendaItemId: z.string().uuid(),
});

type SocketData = {
  principal?: Principal;
  sessionIds?: Set<string>;
};

type AuthenticatedSocket = Socket & { data: SocketData };

@WebSocketGateway({
  namespace: "/realtime",
  cors: {
    origin: (process.env.CORS_ORIGINS ?? "http://localhost:3000")
      .split(",")
      .map((value) => value.trim()),
    credentials: true,
  },
})
export class RealtimeGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleDestroy
{
  private readonly logger = new Logger(RealtimeGateway.name);
  private agendaSubscription?: Subscription;
  private sessionEventSubscription?: Subscription;
  private userEventSubscription?: Subscription;

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    private readonly analytics: AnalyticsService,
    private readonly captions: CaptionsService,
    private readonly sessions: SessionsService,
    private readonly agendas: AgendasService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  afterInit(server: Server): void {
    this.agendaSubscription = this.realtimeEvents.agendaActivated$.subscribe(
      (event) => {
        server
          .to(this.roomName(event.sessionId))
          .emit("agenda.activated", event);
      },
    );
    this.sessionEventSubscription =
      this.realtimeEvents.sessionEvents$.subscribe((event) => {
        server
          .to(this.roomName(event.sessionId))
          .emit(event.eventName, event.payload);
      });
    this.userEventSubscription = this.realtimeEvents.userEvents$.subscribe(
      (event) => {
        for (const userId of new Set(event.userIds)) {
          server.to(this.userRoomName(userId)).emit(event.eventName, event.payload);
        }
      },
    );
  }

  onModuleDestroy(): void {
    this.agendaSubscription?.unsubscribe();
    this.sessionEventSubscription?.unsubscribe();
    this.userEventSubscription?.unsubscribe();
  }

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const rawToken = client.handshake.auth?.token;
      if (typeof rawToken !== "string" || rawToken.length === 0) {
        throw new Error("Missing token");
      }
      const claims = await this.jwt.verifyAsync<AccessTokenClaims>(rawToken, {
        issuer: this.config.getOrThrow<string>("JWT_ISSUER"),
        audience: this.config.getOrThrow<string>("JWT_AUDIENCE"),
      });
      const parsed = principalSchema.parse(claims) as AccessTokenClaims;
      client.data.principal = await this.auth.resolvePrincipalFromClaims(parsed);
      client.data.sessionIds = new Set<string>();
      await client.join(this.userRoomName(client.data.principal.userId));
    } catch {
      client.emit("authorization.error", {
        message: "Invalid or expired access token",
      });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthenticatedSocket): Promise<void> {
    const principal = client.data.principal;
    if (!principal) return;
    for (const sessionId of client.data.sessionIds ?? []) {
      try {
        await this.analytics.closeAttendance(principal, sessionId, client.id);
      } catch (error: unknown) {
        this.logger.warn(
          `Failed to close attendance interval for ${principal.userId} in ${sessionId}: ${error instanceof Error ? error.message : "unknown"}`,
        );
      }
      client.to(this.roomName(sessionId)).emit("participant.left", {
        sessionId,
        userId: principal.userId,
        occurredAt: new Date().toISOString(),
      });
    }
  }

  @SubscribeMessage("session.join")
  async joinSession(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<{ ok: true; sessionId: string }> {
    const principal = this.requirePrincipal(client);
    const { sessionId } = joinSchema.parse(payload);
    await this.sessions.getById(principal, sessionId);
    await this.analytics.openAttendance(principal, sessionId, client.id);
    await client.join(this.roomName(sessionId));
    client.data.sessionIds?.add(sessionId);
    client.to(this.roomName(sessionId)).emit("participant.joined", {
      sessionId,
      userId: principal.userId,
      displayName: principal.displayName,
      occurredAt: new Date().toISOString(),
    });
    return { ok: true, sessionId };
  }

  @SubscribeMessage("caption.publish")
  async publishCaption(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: unknown,
  ) {
    const principal = this.requirePrincipal(client);
    const parsed = captionSchema.parse(payload);
    return this.captions.publish(principal, parsed.sessionId, {
      sequence: parsed.sequence,
      text: parsed.text,
      isFinal: parsed.isFinal,
      ...(parsed.startMs !== undefined ? { startMs: parsed.startMs } : {}),
      ...(parsed.endMs !== undefined ? { endMs: parsed.endMs } : {}),
      ...(parsed.speakerLabel !== undefined
        ? { speakerLabel: parsed.speakerLabel }
        : {}),
      ...(parsed.language !== undefined ? { language: parsed.language } : {}),
      ...(parsed.source !== undefined ? { source: parsed.source } : {}),
    });
  }

  @SubscribeMessage("agenda.activate")
  async activateAgendaItem(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<{
    ok: true;
    sessionId: string;
    agendaItem: AgendaItem;
    activatedAt: string;
  }> {
    const principal = this.requirePrincipal(client);
    const { sessionId, agendaItemId } = activateSchema.parse(payload);
    const result = await this.agendas.activate(
      principal,
      sessionId,
      agendaItemId,
    );
    return { ok: true, ...result };
  }

  private requirePrincipal(client: AuthenticatedSocket): Principal {
    if (!client.data.principal) {
      this.logger.warn(`Unauthenticated socket message rejected: ${client.id}`);
      throw new Error("Unauthorized");
    }
    return client.data.principal;
  }

  private roomName(sessionId: string): string {
    return `session:${sessionId}`;
  }

  private userRoomName(userId: string): string {
    return `user:${userId}`;
  }
}
