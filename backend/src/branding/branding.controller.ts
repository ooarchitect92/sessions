import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/auth/public.decorator';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { BrandingService } from './branding.service';
import { CreateCustomDomainDto } from './dto/create-custom-domain.dto';
import { UpdateBrandingDto } from './dto/update-branding.dto';

@ApiTags('branding')
@ApiBearerAuth()
@Controller('branding')
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  @Get()
  get(@CurrentPrincipal() principal: Principal) {
    return this.branding.getBranding(principal);
  }

  @Patch()
  update(
    @CurrentPrincipal() principal: Principal,
    @Body() input: UpdateBrandingDto,
  ) {
    return this.branding.updateBranding(principal, input);
  }

  @Get('domains')
  listDomains(@CurrentPrincipal() principal: Principal) {
    return this.branding.listDomains(principal);
  }

  @Post('domains')
  createDomain(
    @CurrentPrincipal() principal: Principal,
    @Body() input: CreateCustomDomainDto,
  ) {
    return this.branding.createDomain(principal, input);
  }

  @Post('domains/:domainId/verify')
  verifyDomain(
    @CurrentPrincipal() principal: Principal,
    @Param('domainId', new ParseUUIDPipe({ version: '4' })) domainId: string,
  ) {
    return this.branding.verifyDomain(principal, domainId);
  }

  @Post('domains/:domainId/disable')
  disableDomain(
    @CurrentPrincipal() principal: Principal,
    @Param('domainId', new ParseUUIDPipe({ version: '4' })) domainId: string,
  ) {
    return this.branding.disableDomain(principal, domainId);
  }

  @Public()
  @Get('resolve')
  resolve(@Query('hostname') hostname: string) {
    return this.branding.resolvePublicBranding(hostname);
  }
}
