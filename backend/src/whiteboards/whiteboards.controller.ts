import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { ApplyWhiteboardOperationDto } from './dto/apply-whiteboard-operation.dto';
import { WhiteboardsService } from './whiteboards.service';

@ApiTags('whiteboards')
@ApiBearerAuth()
@Controller('sessions/:sessionId/whiteboard')
export class WhiteboardsController {
  constructor(private readonly whiteboards: WhiteboardsService) {}

  @Get()
  getState(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.whiteboards.getState(principal, sessionId);
  }

  @Post('operations')
  applyOperation(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: ApplyWhiteboardOperationDto,
  ) {
    return this.whiteboards.applyOperation(principal, sessionId, body);
  }
}
