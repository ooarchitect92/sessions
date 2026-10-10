import { Module } from '@nestjs/common';
import { AgendasModule } from '../agendas/agendas.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { CaptionsModule } from '../captions/captions.module';
import { SessionsModule } from '../sessions/sessions.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [SessionsModule, AgendasModule, AnalyticsModule, CaptionsModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
