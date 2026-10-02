import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Principal } from '../common/auth/principal';

@Injectable()
export class AuditService {
  async record(
    transaction: Prisma.TransactionClient,
    principal: Principal,
    input: {
      action: string;
      resourceType: string;
      resourceId?: string;
      metadata?: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await transaction.auditEvent.create({
      data: {
        organizationId: principal.organizationId,
        workspaceId: principal.workspaceId,
        actorUserId: principal.userId,
        action: input.action,
        resourceType: input.resourceType,
        ...(input.resourceId ? { resourceId: input.resourceId } : {}),
        metadata: input.metadata ?? {},
      },
    });
  }
}
