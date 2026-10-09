import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EnterpriseIdentityController, ScimController } from './enterprise-identity.controller';
import { EnterpriseIdentityService } from './enterprise-identity.service';

@Module({
  imports: [AuditModule],
  controllers: [EnterpriseIdentityController, ScimController],
  providers: [EnterpriseIdentityService],
  exports: [EnterpriseIdentityService],
})
export class EnterpriseIdentityModule {}