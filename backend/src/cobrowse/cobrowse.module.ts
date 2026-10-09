import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ContentModule } from '../content/content.module';
import { OutboxModule } from '../outbox/outbox.module';
import { CobrowseController } from './cobrowse.controller';
import { CobrowseService } from './cobrowse.service';

@Module({
  imports: [AuditModule, ContentModule, OutboxModule],
  controllers: [CobrowseController],
  providers: [CobrowseService],
  exports: [CobrowseService],
})
export class CobrowseModule {}
