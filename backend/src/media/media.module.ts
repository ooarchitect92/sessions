import { Module } from '@nestjs/common';
import { RecordingsModule } from '../recordings/recordings.module';
import { SessionsModule } from '../sessions/sessions.module';
import { MediaController } from './media.controller';
import { PublicWebinarMediaController } from './public-webinar-media.controller';
import { MediaService } from './media.service';

@Module({
  imports: [SessionsModule, RecordingsModule],
  controllers: [MediaController, PublicWebinarMediaController],
  providers: [MediaService],
})
export class MediaModule {}
