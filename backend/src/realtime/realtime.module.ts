import { Module } from '@nestjs/common';
import { AgendasModule } from '../agendas/agendas.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { SessionsModule } from '../sessions/sessions.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [SessionsModule, AgendasModule, AttendanceModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
