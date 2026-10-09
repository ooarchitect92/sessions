import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { BillingService } from './billing.service';

@ApiTags('billing')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('current')
  current(@CurrentPrincipal() principal: Principal) {
    return this.billing.current(principal);
  }

  @Get('plans')
  plans(@CurrentPrincipal() principal: Principal) {
    return this.billing.catalog(principal);
  }
}