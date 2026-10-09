import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EnterpriseIdentityController, ScimController } from './enterprise-identity.controller';
import { EnterpriseIdentityService } from './enterprise-identity.service';
import { OidcLoginService } from './oidc-login.service';

@Module({
  imports: [AuditModule],
  controllers: [EnterpriseIdentityController, ScimController],
  providers: [EnterpriseIdentityService, OidcLoginService],
  exports: [EnterpriseIdentityService],
})
export class EnterpriseIdentityModule {}