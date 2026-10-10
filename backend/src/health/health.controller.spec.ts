import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../infrastructure/redis.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const createController = (redisReply: string, databaseFailure = false) => {
    const database = {
      $queryRaw: databaseFailure
        ? vi.fn().mockRejectedValue(new Error('database unavailable'))
        : vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const redis = { ping: vi.fn().mockResolvedValue(redisReply) };
    return {
      controller: new HealthController(
        database as unknown as PrismaService,
        redis as unknown as RedisService,
      ),
      database,
      redis,
    };
  };

  it('keeps liveness independent from database and Redis', () => {
    const { controller, database, redis } = createController('UNKNOWN', true);
    expect(controller.liveness()).toEqual({ status: 'ok' });
    expect(database.$queryRaw).not.toHaveBeenCalled();
    expect(redis.ping).not.toHaveBeenCalled();
  });

  it('returns ready only when PostgreSQL succeeds and Redis acknowledges PONG', async () => {
    const { controller, database, redis } = createController('PONG');
    await expect(controller.readiness()).resolves.toEqual({
      status: 'ok',
      dependencies: { postgres: 'ok', redis: 'ok' },
    });
    expect(database.$queryRaw).toHaveBeenCalledOnce();
    expect(redis.ping).toHaveBeenCalledOnce();
  });

  it.each(['ERR', '', 'OK'])('fails closed on Redis response %j', async (reply) => {
    const { controller } = createController(reply);
    await expect(controller.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('returns unavailable when PostgreSQL cannot be reached', async () => {
    const { controller, redis } = createController('PONG', true);
    await expect(controller.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(redis.ping).not.toHaveBeenCalled();
  });

  it('returns unavailable when Redis ping rejects', async () => {
    const { controller, redis } = createController('PONG');
    redis.ping.mockRejectedValueOnce(new Error('redis unavailable'));
    await expect(controller.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
