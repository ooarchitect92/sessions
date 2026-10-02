import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Principal } from '../common/auth/principal';
import { PrismaService } from './prisma.service';

@Injectable()
export class TenantDatabaseService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(
    principal: Principal,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRaw`SELECT set_config('app.organization_id', ${principal.organizationId}, true)`;
        await transaction.$executeRaw`SELECT set_config('app.workspace_id', ${principal.workspaceId}, true)`;
        return operation(transaction);
      },
      { timeout: 15_000, maxWait: 5_000 },
    );
  }
}
