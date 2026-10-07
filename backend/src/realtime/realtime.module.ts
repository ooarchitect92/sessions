import { Module } from '@nestjs/common';
import { AgendasModule } from '../agendas/agendas.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { SessionsModule } from '../sessions/sessions.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [SessionsModule, AgendasModule, AnalyticsModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
