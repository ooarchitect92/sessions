import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CustomDomainsController } from './custom-domains.controller';
import { CustomDomainsService } from './custom-domains.service';

@Module({
  imports: [AuditModule],
  controllers: [CustomDomainsController],
  providers: [CustomDomainsService],
})
export class CustomDomainsModule {}