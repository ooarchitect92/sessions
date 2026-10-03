import { Global, Module } from '@nestjs/common';
import { RateLimitService } from '../common/security/rate-limit.service';
import { PresenceService } from './presence.service';
import { RealtimeEventsService } from './realtime-events.service';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService, RealtimeEventsService, RateLimitService, PresenceService],
  exports: [RedisService, RealtimeEventsService, RateLimitService, PresenceService],
})
export class InfrastructureModule {}
