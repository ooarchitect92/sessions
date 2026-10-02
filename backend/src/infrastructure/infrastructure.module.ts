import { Global, Module } from '@nestjs/common';
import { RealtimeEventsService } from './realtime-events.service';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService, RealtimeEventsService],
  exports: [RedisService, RealtimeEventsService],
})
export class InfrastructureModule {}
