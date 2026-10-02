import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

/**
 * Database client for trusted background workers. In production this URL must use
 * a separate database role that can claim cross-tenant outbox rows while the API
 * role remains constrained by RLS.
 */
@Injectable()
export class WorkerPrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    super({
      datasourceUrl:
        config.get<string>('WORKER_DATABASE_URL') ?? config.getOrThrow<string>('DATABASE_URL'),
      log: ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
