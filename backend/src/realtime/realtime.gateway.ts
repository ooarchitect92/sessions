import { Logger, OnModuleDestroy } from "@nestjs/common";
import { randomUUID } from "node:crypto";
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
import { AuthService } from "../auth/auth.service";
import type { AccessTokenClaims, Principal } from "../common/auth/principal";
import { RealtimeEventsService } from "../infrastructure/realtime-events.service";
import { RedisService } from "../infrastructure/redis.service";
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
const activateSchema = z.object({
  sessionId: z.string().uuid(),
  agendaItemId: z.string().uuid(),
});
const reactionSchema = z.object({
  sessionId: z.string().uuid(),
  reaction: z.enum(["👍", "❤️", "😂", "👏", "🎉", "🙌"]),
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

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly agendas: AgendasService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly redis: RedisService,
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
        if (event.audienceUserIds?.length) {
          for (const userId of new Set(event.audienceUserIds)) {
            server
              .to(this.userRoomName(userId))
              .emit(event.eventName, event.payload);
          }
          return;
        }
        server
          .to(this.roomName(event.sessionId))
          .emit(event.eventName, event.payload);
      });
  }

  onModuleDestroy(): void {
    this.agendaSubscription?.unsubscribe();
    this.sessionEventSubscription?.unsubscribe();
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

  handleDisconnect(client: AuthenticatedSocket): void {
    const principal = client.data.principal;
    if (!principal) return;
    for (const sessionId of client.data.sessionIds ?? []) {
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

  @SubscribeMessage("reaction.send")
  async sendReaction(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<{ ok: true; reactionId: string }> {
    const principal = this.requirePrincipal(client);
    const { sessionId, reaction } = reactionSchema.parse(payload);
    if (!client.data.sessionIds?.has(sessionId)) {
      throw new Error("Join the session before sending a reaction");
    }

    const throttleKey = `reaction:v1:${sessionId}:${principal.userId}`;
    const accepted = await this.redis.set(throttleKey, "1", "PX", 700, "NX");
    if (accepted !== "OK") {
      throw new Error("Please wait before sending another reaction");
    }

    const event = {
      reactionId: randomUUID(),
      sessionId,
      userId: principal.userId,
      displayName: principal.displayName,
      reaction,
      occurredAt: new Date().toISOString(),
    };
    this.server.to(this.roomName(sessionId)).emit("reaction.received", event);
    return { ok: true, reactionId: event.reactionId };
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
