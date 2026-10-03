import { Injectable } from '@nestjs/common';
import type { Principal } from '../common/auth/principal';
import { RedisService } from './redis.service';

export interface PresenceParticipant {
  userId: string;
  displayName: string;
  roles: string[];
  joinedAt: string;
  lastSeenAt: string;
}

@Injectable()
export class PresenceService {
  private readonly presenceTtlMs = 90_000;
  private readonly keyTtlSeconds = 24 * 60 * 60;

  constructor(private readonly redis: RedisService) {}

  async join(
    sessionId: string,
    principal: Principal,
    socketId: string,
  ): Promise<{ participants: PresenceParticipant[]; firstConnection: boolean }> {
    const socketKey = this.socketKey(sessionId, principal.userId);
    await this.redis.sadd(socketKey, socketId);
    const socketCount = await this.redis.scard(socketKey);
    await this.touch(sessionId, principal, socketKey);

    return {
      participants: await this.list(sessionId),
      firstConnection: socketCount === 1,
    };
  }

  async heartbeat(
    sessionId: string,
    principal: Principal,
    socketId: string,
  ): Promise<void> {
    const socketKey = this.socketKey(sessionId, principal.userId);
    await this.redis.sadd(socketKey, socketId);
    await this.touch(sessionId, principal, socketKey);
  }

  async leave(
    sessionId: string,
    userId: string,
    socketId: string,
  ): Promise<{ participants: PresenceParticipant[]; departed: boolean }> {
    const socketKey = this.socketKey(sessionId, userId);
    await this.redis.srem(socketKey, socketId);
    const remaining = await this.redis.scard(socketKey);

    if (remaining <= 0) {
      await this.redis
        .multi()
        .del(socketKey)
        .hdel(this.membersKey(sessionId), userId)
        .zrem(this.expiryKey(sessionId), userId)
        .exec();
    }

    return {
      participants: await this.list(sessionId),
      departed: remaining <= 0,
    };
  }

  async list(sessionId: string): Promise<PresenceParticipant[]> {
    const expiryKey = this.expiryKey(sessionId);
    const membersKey = this.membersKey(sessionId);
    const now = Date.now();

    const expired = await this.redis.zrangebyscore(expiryKey, 0, now);
    if (expired.length > 0) {
      const cleanup = this.redis.multi().zrem(expiryKey, ...expired);
      cleanup.hdel(membersKey, ...expired);
      await cleanup.exec();
    }

    const activeIds = await this.redis.zrange(expiryKey, 0, -1);
    if (activeIds.length === 0) return [];

    const profiles = await this.redis.hmget(membersKey, ...activeIds);
    return profiles
      .map((raw) => this.parse(raw))
      .filter((participant): participant is PresenceParticipant => Boolean(participant))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  private async touch(
    sessionId: string,
    principal: Principal,
    socketKey: string,
  ): Promise<void> {
    const now = new Date();
    const membersKey = this.membersKey(sessionId);
    const expiryKey = this.expiryKey(sessionId);
    const existing = await this.redis.hget(membersKey, principal.userId);
    const parsed = this.parse(existing);

    const participant: PresenceParticipant = {
      userId: principal.userId,
      displayName: principal.displayName,
      roles: principal.roles,
      joinedAt: parsed?.joinedAt ?? now.toISOString(),
      lastSeenAt: now.toISOString(),
    };

    await this.redis
      .multi()
      .hset(membersKey, principal.userId, JSON.stringify(participant))
      .zadd(expiryKey, Date.now() + this.presenceTtlMs, principal.userId)
      .expire(membersKey, this.keyTtlSeconds)
      .expire(expiryKey, this.keyTtlSeconds)
      .expire(socketKey, Math.ceil(this.presenceTtlMs / 1000) + 30)
      .exec();
  }

  private parse(value: string | null): PresenceParticipant | null {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value) as Partial<PresenceParticipant>;
      if (
        typeof parsed.userId !== 'string' ||
        typeof parsed.displayName !== 'string' ||
        !Array.isArray(parsed.roles) ||
        typeof parsed.joinedAt !== 'string' ||
        typeof parsed.lastSeenAt !== 'string'
      ) {
        return null;
      }
      return {
        userId: parsed.userId,
        displayName: parsed.displayName,
        roles: parsed.roles.filter((role): role is string => typeof role === 'string'),
        joinedAt: parsed.joinedAt,
        lastSeenAt: parsed.lastSeenAt,
      };
    } catch {
      return null;
    }
  }

  private membersKey(sessionId: string): string {
    return `presence:v1:session:${sessionId}:members`;
  }

  private expiryKey(sessionId: string): string {
    return `presence:v1:session:${sessionId}:expiry`;
  }

  private socketKey(sessionId: string, userId: string): string {
    return `presence:v1:session:${sessionId}:user:${userId}:sockets`;
  }
}
