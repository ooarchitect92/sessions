import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, Max, Min } from 'class-validator';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { GovernanceService } from './governance.service';

class UpdateRetentionPolicyDto {
  @IsInt() @Min(1) @Max(3650) recordingDays!: number;
  @IsInt() @Min(1) @Max(3650) transcriptDays!: number;
  @IsInt() @Min(30) @Max(3650) auditDays!: number;
  @IsBoolean() deleteOnExpiry!: boolean;
  @IsBoolean() legalHold!: boolean;
}

@ApiTags('governance')
@ApiBearerAuth()
@Controller('governance')
export class GovernanceController {
  constructor(private readonly governance: GovernanceService) {}

  @Get('retention')
  retention(@CurrentPrincipal() principal: Principal) {
    return this.governance.getRetentionPolicy(principal);
  }

  @Put('retention')
  updateRetention(
    @CurrentPrincipal() principal: Principal,
    @Body() body: UpdateRetentionPolicyDto,
  ) {
    return this.governance.updateRetentionPolicy(principal, body);
  }

  @Get('audit/export')
  auditExport(
    @CurrentPrincipal() principal: Principal,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.governance.auditExport(principal, from, to);
  }
}