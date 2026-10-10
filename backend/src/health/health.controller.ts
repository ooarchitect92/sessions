import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/auth/public.decorator';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../infrastructure/redis.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get('live')
  liveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  async readiness(): Promise<{ status: 'ok'; dependencies: Record<string, string> }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const redis = await this.redis.ping();
      if (redis.trim().toUpperCase() !== 'PONG') {
        throw new Error('Redis did not acknowledge the readiness probe');
      }
      return { status: 'ok', dependencies: { postgres: 'ok', redis: 'ok' } };
    } catch {
      throw new ServiceUnavailableException('A required dependency is unavailable');
    }
  }
}
