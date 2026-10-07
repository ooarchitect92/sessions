import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { AppendWhiteboardOperationDto } from './dto/append-whiteboard-operation.dto';
import { WhiteboardsService } from './whiteboards.service';

@ApiTags('whiteboards')
@ApiBearerAuth()
@Controller('sessions/:sessionId/whiteboard')
export class WhiteboardsController {
  constructor(private readonly whiteboards: WhiteboardsService) {}

  @Get()
  getBoard(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.whiteboards.getBoard(principal, sessionId);
  }

  @Post('operations')
  appendOperation(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: AppendWhiteboardOperationDto,
  ) {
    return this.whiteboards.appendOperation(principal, sessionId, body);
  }
}
