import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { RecordingsModule } from '../recordings/recordings.module';
import { SessionsModule } from '../sessions/sessions.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  imports: [SessionsModule, RecordingsModule, AuditModule, OutboxModule],
  controllers: [MediaController],
  providers: [MediaService],
})
export class MediaModule {}
