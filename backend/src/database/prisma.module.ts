import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantDatabaseService } from './tenant-database.service';
import { WorkerPrismaService } from './worker-prisma.service';

@Global()
@Module({
  providers: [PrismaService, WorkerPrismaService, TenantDatabaseService],
  exports: [PrismaService, WorkerPrismaService, TenantDatabaseService],
})
export class PrismaModule {}
