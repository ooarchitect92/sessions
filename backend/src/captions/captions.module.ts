import { Module } from '@nestjs/common';
import { CaptionsController } from './captions.controller';
import { CaptionsService } from './captions.service';

@Module({
  controllers: [CaptionsController],
  providers: [CaptionsService],
  exports: [CaptionsService],
})
export class CaptionsModule {}
