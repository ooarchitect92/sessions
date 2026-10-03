import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { AgendasModule } from "./agendas/agendas.module";
import { AiModule } from "./ai/ai.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { AttendanceModule } from "./attendance/attendance.module";
import { AuthModule } from "./auth/auth.module";
import { BookingsModule } from "./bookings/bookings.module";
import { BreakoutsModule } from "./breakouts/breakouts.module";
import { CollaborationModule } from "./collaboration/collaboration.module";
import { PrincipalGuard } from "./common/auth/principal.guard";
import { validateEnvironment } from "./common/config/env.validation";
import { RateLimitGuard } from "./common/security/rate-limit.guard";
import { ApiEnvelopeInterceptor } from "./common/http/api-envelope.interceptor";
import { ApiExceptionFilter } from "./common/http/api-exception.filter";
import { PrismaModule } from "./database/prisma.module";
import { EventsModule } from "./events/events.module";
import { FilesModule } from "./files/files.module";
import { HealthModule } from "./health/health.module";
import { InfrastructureModule } from "./infrastructure/infrastructure.module";
import { MediaModule } from "./media/media.module";
import { MemoryModule } from "./memory/memory.module";
import { OutboxModule } from "./outbox/outbox.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { RecordingsModule } from "./recordings/recordings.module";
import { RoomsModule } from "./rooms/rooms.module";
import { SessionsModule } from "./sessions/sessions.module";
import { TranscriptionModule } from "./transcription/transcription.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { WorkspacesModule } from "./workspaces/workspaces.module";
import { WhiteboardsModule } from "./whiteboards/whiteboards.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    InfrastructureModule,
    AttendanceModule,
    AuthModule,
    WorkspacesModule,
    HealthModule,
    OutboxModule,
    MemoryModule,
    RecordingsModule,
    TranscriptionModule,
    SessionsModule,
    RoomsModule,
    AgendasModule,
    AiModule,
    AnalyticsModule,
    EventsModule,
    FilesModule,
    BookingsModule,
    BreakoutsModule,
    CollaborationModule,
    MediaModule,
    RealtimeModule,
    WebhooksModule,
    WhiteboardsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: PrincipalGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ApiEnvelopeInterceptor },
  ],
})
export class AppModule {}
