import { Module } from '@nestjs/common';
import { BreakoutsModule } from '../breakouts/breakouts.module';
import { RecordingsModule } from '../recordings/recordings.module';
import { SessionsModule } from '../sessions/sessions.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  imports: [SessionsModule, RecordingsModule, BreakoutsModule],
  controllers: [MediaController],
  providers: [MediaService],
})
export class MediaModule {}
