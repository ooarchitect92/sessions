import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { AgendasModule } from "./agendas/agendas.module";
import { AuthModule } from "./auth/auth.module";
import { BookingsModule } from "./bookings/bookings.module";
import { CollaborationModule } from "./collaboration/collaboration.module";
import { PrincipalGuard } from "./common/auth/principal.guard";
import { validateEnvironment } from "./common/config/env.validation";
import { ApiEnvelopeInterceptor } from "./common/http/api-envelope.interceptor";
import { ApiExceptionFilter } from "./common/http/api-exception.filter";
import { PrismaModule } from "./database/prisma.module";
import { EventsModule } from "./events/events.module";
import { HealthModule } from "./health/health.module";
import { InfrastructureModule } from "./infrastructure/infrastructure.module";
import { MediaModule } from "./media/media.module";
import { MemoryModule } from "./memory/memory.module";
import { OutboxModule } from "./outbox/outbox.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { RoomsModule } from "./rooms/rooms.module";
import { SessionsModule } from "./sessions/sessions.module";
import { WorkspacesModule } from "./workspaces/workspaces.module";

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
    AuthModule,
    WorkspacesModule,
    HealthModule,
    OutboxModule,
    MemoryModule,
    SessionsModule,
    RoomsModule,
    AgendasModule,
    EventsModule,
    BookingsModule,
    CollaborationModule,
    MediaModule,
    RealtimeModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: PrincipalGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ApiEnvelopeInterceptor },
  ],
})
export class AppModule {}
