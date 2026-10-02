import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  imports: [SessionsModule],
  controllers: [MediaController],
  providers: [MediaService],
})
export class MediaModule {}
