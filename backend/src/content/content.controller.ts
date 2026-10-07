import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ResolveEmbedDto } from './dto/resolve-embed.dto';
import { EmbedResolverService } from './embed-resolver.service';

@ApiTags('content')
@ApiBearerAuth()
@Controller('content')
export class ContentController {
  constructor(private readonly embeds: EmbedResolverService) {}

  @Post('resolve-embed')
  resolveEmbed(@Body() body: ResolveEmbedDto) {
    return this.embeds.resolve(body.url);
  }
}
