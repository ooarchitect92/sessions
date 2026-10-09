import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BreakoutsModule } from '../breakouts/breakouts.module';
import { EventsModule } from '../events/events.module';
import { RecordingsModule } from '../recordings/recordings.module';
import { SessionsModule } from '../sessions/sessions.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  imports: [AuditModule, SessionsModule, RecordingsModule, BreakoutsModule, EventsModule],
  controllers: [MediaController],
  providers: [MediaService],
})
export class MediaModule {}
