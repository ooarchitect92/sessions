import { Body, Controller, Delete, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Equals, IsString } from 'class-validator';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { PrivacyService } from './privacy.service';

class ConfirmAccountErasureDto {
  @IsString()
  @Equals('DELETE MY ACCOUNT')
  confirmation!: string;
}

@ApiTags('privacy')
@ApiBearerAuth()
@Controller('privacy')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get('export')
  exportMyData(@CurrentPrincipal() principal: Principal) {
    return this.privacy.exportMyData(principal);
  }

  @Delete('account')
  eraseMyAccount(
    @CurrentPrincipal() principal: Principal,
    @Body() _body: ConfirmAccountErasureDto,
  ) {
    return this.privacy.eraseMyAccount(principal);
  }
}
