import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { EmbedResolverService } from './embed-resolver.service';

@Module({
  controllers: [ContentController],
  providers: [EmbedResolverService],
  exports: [EmbedResolverService],
})
export class ContentModule {}
