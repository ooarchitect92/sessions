import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { AttendanceService } from './attendance.service';

@ApiTags('attendance')
@ApiBearerAuth()
@Controller('sessions')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get(':id/attendance')
  list(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.attendance.listSession(principal, sessionId);
  }
}
