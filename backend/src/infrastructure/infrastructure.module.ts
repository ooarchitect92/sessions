import { Global, Module } from '@nestjs/common';
import { RateLimitService } from '../common/security/rate-limit.service';
import { RealtimeEventsService } from './realtime-events.service';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService, RealtimeEventsService, RateLimitService],
  exports: [RedisService, RealtimeEventsService, RateLimitService],
})
export class InfrastructureModule {}
