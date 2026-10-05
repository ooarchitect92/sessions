import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { AppendWhiteboardOperationDto } from './dto/append-whiteboard-operation.dto';
import { SaveWhiteboardSnapshotDto } from './dto/save-whiteboard-snapshot.dto';
import { WhiteboardService } from './whiteboard.service';

@ApiTags('whiteboard')
@ApiBearerAuth()
@Controller('sessions/:sessionId/whiteboard')
export class WhiteboardController {
  constructor(private readonly whiteboard: WhiteboardService) {}

  @Get()
  get(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.whiteboard.get(principal, sessionId);
  }

  @Post('operations')
  appendOperation(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: AppendWhiteboardOperationDto,
  ) {
    return this.whiteboard.appendOperation(principal, sessionId, body);
  }

  @Post('snapshot')
  saveSnapshot(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: SaveWhiteboardSnapshotDto,
  ) {
    return this.whiteboard.saveSnapshot(principal, sessionId, body);
  }
}
