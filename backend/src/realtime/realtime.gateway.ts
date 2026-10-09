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
import { SessionStatus, type AgendaItem } from "@prisma/client";
import type { Server, Socket } from "socket.io";
import type { Subscription } from "rxjs";
import { z } from "zod";
import { AgendasService } from "../agendas/agendas.service";
import { AnalyticsService } from "../analytics/analytics.service";
import { AuthService } from "../auth/auth.service";
import type { AccessTokenClaims, Principal } from "../common/auth/principal";
import { RealtimeEventsService } from "../infrastructure/realtime-events.service";
import { SessionsService } from "../sessions/sessions.service";
import { TranscriptionProviderService } from "../transcription/transcription-provider.service";

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

const whiteboardCursorSchema = z.object({
  sessionId: z.string().uuid(),
  x: z.number().finite().min(0).max(1000),
  y: z.number().finite().min(0).max(650),
  visible: z.boolean().default(true),
});

const captionAudioSchema = z.object({
  sessionId: z.string().uuid(),
  sequence: z.number().int().min(0).max(1_000_000),
  mimeType: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .refine(
      (value) =>
        [
          "audio/webm",
          "audio/webm;codecs=opus",
          "audio/ogg",
          "audio/ogg;codecs=opus",
          "audio/mp4",
          "audio/mp4;codecs=mp4a.40.2",
        ].includes(value.toLowerCase()),
      "Unsupported live-caption audio format",
    ),
  language: z.string().trim().min(2).max(32).optional().nullable(),
  audio: z.unknown(),
});

type SocketData = {
  principal?: Principal;
  sessionIds?: Set<string>;
  whiteboardCursorSentAt?: Map<string, number>;
  captionAcceptedAt?: Map<string, number>;
  captionInFlight?: Set<string>;
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
    private readonly sessions: SessionsService,
    private readonly agendas: AgendasService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly transcription: TranscriptionProviderService,
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
      client.data.whiteboardCursorSentAt = new Map<string, number>();
      client.data.captionAcceptedAt = new Map<string, number>();
      client.data.captionInFlight = new Set<string>();
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
      client.to(this.roomName(sessionId)).emit("whiteboard.cursor.updated", {
        sessionId,
        userId: principal.userId,
        displayName: principal.displayName,
        x: 0,
        y: 0,
        visible: false,
        occurredAt: new Date().toISOString(),
      });
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

  @SubscribeMessage("whiteboard.cursor")
  async updateWhiteboardCursor(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<{ ok: true; throttled?: true }> {
    const principal = this.requirePrincipal(client);
    const cursor = whiteboardCursorSchema.parse(payload);

    if (!client.data.sessionIds?.has(cursor.sessionId)) {
      throw new Error("Join the session before publishing whiteboard cursor state");
    }

    const now = Date.now();
    const previous = client.data.whiteboardCursorSentAt?.get(cursor.sessionId) ?? 0;
    if (cursor.visible && now - previous < 40) {
      return { ok: true, throttled: true };
    }
    client.data.whiteboardCursorSentAt?.set(cursor.sessionId, now);

    client.to(this.roomName(cursor.sessionId)).emit("whiteboard.cursor.updated", {
      sessionId: cursor.sessionId,
      userId: principal.userId,
      displayName: principal.displayName,
      x: cursor.x,
      y: cursor.y,
      visible: cursor.visible,
      occurredAt: new Date(now).toISOString(),
    });
    return { ok: true };
  }

  @SubscribeMessage("caption.audio")
  async transcribeLiveCaption(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: unknown,
  ): Promise<{
    ok: true;
    sequence?: number;
    emitted?: boolean;
    throttled?: true;
  }> {
    const principal = this.requirePrincipal(client);
    const caption = captionAudioSchema.parse(payload);

    if (!client.data.sessionIds?.has(caption.sessionId)) {
      throw new Error("Join the session before publishing live-caption audio");
    }

    const session = await this.sessions.getById(principal, caption.sessionId);
    if (session.status !== SessionStatus.LIVE) {
      throw new Error("Live captions are only available during a live session");
    }
    if (!session.transcriptionEnabled) {
      throw new Error("Live transcription is disabled for this session");
    }
    if (!this.transcription.isEnabled()) {
      client.emit("caption.error", {
        sessionId: caption.sessionId,
        sequence: caption.sequence,
        code: "provider_unavailable",
        message: "Live transcription is not configured for this workspace runtime.",
      });
      return { ok: true, sequence: caption.sequence, emitted: false };
    }

    const now = Date.now();
    const previous = client.data.captionAcceptedAt?.get(caption.sessionId) ?? 0;
    if (now - previous < 1500 || client.data.captionInFlight?.has(caption.sessionId)) {
      return { ok: true, sequence: caption.sequence, throttled: true };
    }

    const bytes = this.captionBuffer(caption.audio);
    const maxBytes = this.config.get<number>(
      "LIVE_CAPTION_MAX_CHUNK_BYTES",
      2 * 1024 * 1024,
    );
    if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) {
      client.emit("caption.error", {
        sessionId: caption.sessionId,
        sequence: caption.sequence,
        code: "invalid_chunk",
        message: "Live-caption audio chunk is empty or exceeds the configured limit.",
      });
      return { ok: true, sequence: caption.sequence, emitted: false };
    }

    client.data.captionAcceptedAt?.set(caption.sessionId, now);
    client.data.captionInFlight?.add(caption.sessionId);

    try {
      const result = await this.transcription.transcribe({
        media: bytes,
        mimeType: caption.mimeType,
        filename: `live-${caption.sessionId}-${principal.userId}-${caption.sequence}.${this.captionExtension(caption.mimeType)}`,
        language: caption.language ?? null,
      });
      const text = result.fullText.trim();
      if (!text) {
        return { ok: true, sequence: caption.sequence, emitted: false };
      }

      const event = {
        sessionId: caption.sessionId,
        sequence: caption.sequence,
        speakerUserId: principal.userId,
        speakerName: principal.displayName,
        text: text.slice(0, 8000),
        language: result.language ?? caption.language ?? null,
        provider: result.provider,
        occurredAt: new Date().toISOString(),
      };
      this.server.to(this.roomName(caption.sessionId)).emit("caption.final", event);
      return { ok: true, sequence: caption.sequence, emitted: true };
    } catch (error: unknown) {
      this.logger.warn(
        `Live caption transcription failed for ${principal.userId} in ${caption.sessionId}: ${error instanceof Error ? error.message : "unknown"}`,
      );
      client.emit("caption.error", {
        sessionId: caption.sessionId,
        sequence: caption.sequence,
        code: "transcription_failed",
        message: "This live-caption chunk could not be transcribed.",
      });
      return { ok: true, sequence: caption.sequence, emitted: false };
    } finally {
      client.data.captionInFlight?.delete(caption.sessionId);
    }
  }

  private captionBuffer(value: unknown): Buffer {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof ArrayBuffer) return Buffer.from(value);
    if (ArrayBuffer.isView(value)) {
      return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    }
    return Buffer.alloc(0);
  }

  private captionExtension(mimeType: string): string {
    const normalized = mimeType.toLowerCase();
    if (normalized.startsWith("audio/mp4")) return "m4a";
    if (normalized.startsWith("audio/ogg")) return "ogg";
    return "webm";
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
