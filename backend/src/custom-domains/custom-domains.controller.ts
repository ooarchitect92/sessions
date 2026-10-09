import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { CreateCustomDomainDto } from './custom-domains.dto';
import { CustomDomainsService } from './custom-domains.service';

@ApiTags('custom-domains')
@ApiBearerAuth()
@Controller('custom-domains')
export class CustomDomainsController {
  constructor(private readonly domains: CustomDomainsService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal) {
    return this.domains.list(principal);
  }

  @Post()
  create(@CurrentPrincipal() principal: Principal, @Body() body: CreateCustomDomainDto) {
    return this.domains.create(principal, body);
  }

  @Post(':id/verify')
  verify(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.domains.verify(principal, id);
  }

  @Delete(':id')
  remove(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.domains.remove(principal, id);
  }
}