import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type ApiKey, type WebhookSubscription } from '@prisma/client';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { isIP } from 'node:net';
import { AuditService } from '../audit/audit.service';
import { ADMIN_ROLES, hasAnyRole, type Principal } from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { CreateWebhookSubscriptionDto } from './dto/create-webhook-subscription.dto';
import { UpdateWebhookSubscriptionDto } from './dto/update-webhook-subscription.dto';

type PublicApiKey = Omit<ApiKey, 'keyHash'>;
type PublicWebhook = Omit<WebhookSubscription, 'encryptedSecret'>;

@Injectable()
export class IntegrationsService {
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly database: TenantDatabaseService,
    private readonly worker: WorkerPrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {
    this.encryptionKey = Buffer.from(
      this.config.getOrThrow<string>('AUTH_ENCRYPTION_KEY'),
      'hex',
    );
  }

  async createApiKey(principal: Principal, input: CreateApiKeyDto): Promise<PublicApiKey & { token: string }> {
    this.assertAdmin(principal);
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) throw new BadRequestException('expiresAt must be in the future');

    const prefix = randomBytes(6).toString('hex');
    const token = 'sess_sk_' + prefix + '_' + randomBytes(32).toString('base64url');
    const keyHash = createHash('sha256').update(token).digest('hex');

    return this.database.run(principal, async (transaction) => {
      const created = await transaction.apiKey.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          userId: principal.userId,
          name: input.name.trim(),
          prefix,
          keyHash,
          scopes: ['*'],
          expiresAt,
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'api_key.created',
        resourceType: 'api_key',
        resourceId: created.id,
        metadata: { prefix: created.prefix, expiresAt: created.expiresAt?.toISOString() ?? null },
      });
      return { ...this.publicApiKey(created), token };
    });
  }

  async listApiKeys(principal: Principal): Promise<PublicApiKey[]> {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) =>
      (await transaction.apiKey.findMany({ orderBy: { createdAt: 'desc' } })).map((item) => this.publicApiKey(item)),
    );
  }

  async revokeApiKey(principal: Principal, id: string): Promise<PublicApiKey> {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const current = await transaction.apiKey.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('API key not found');
      const updated = current.revokedAt ? current : await transaction.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
      await this.audit.record(transaction, principal, { action: 'api_key.revoked', resourceType: 'api_key', resourceId: id });
      return this.publicApiKey(updated);
    });
  }

  async resolveApiKeyPrincipal(token: string): Promise<Principal> {
    const keyHash = createHash('sha256').update(token).digest('hex');
    const apiKey = await this.worker.apiKey.findUnique({ where: { keyHash } });
    if (!apiKey || apiKey.revokedAt || (apiKey.expiresAt && apiKey.expiresAt.getTime() <= Date.now())) {
      throw new UnauthorizedException('The API key is invalid, expired, or revoked');
    }
    const [membership, user] = await Promise.all([
      this.worker.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId: apiKey.workspaceId, userId: apiKey.userId } },
      }),
      this.worker.user.findUnique({ where: { id: apiKey.userId } }),
    ]);
    if (!membership || !user || membership.organizationId !== apiKey.organizationId) {
      throw new UnauthorizedException('The API key owner no longer has workspace access');
    }
    await this.worker.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } });
    return {
      userId: user.id,
      organizationId: apiKey.organizationId,
      workspaceId: apiKey.workspaceId,
      email: user.email,
      displayName: user.displayName,
      roles: [membership.role],
    };
  }

  async createWebhook(principal: Principal, input: CreateWebhookSubscriptionDto): Promise<PublicWebhook & { secret: string }> {
    this.assertAdmin(principal);
    const url = this.validateWebhookUrl(input.url);
    const eventTypes = this.normalizeEventTypes(input.eventTypes);
    const secret = randomBytes(32).toString('base64url');

    return this.database.run(principal, async (transaction) => {
      const duplicate = await transaction.webhookSubscription.findUnique({
        where: { workspaceId_name: { workspaceId: principal.workspaceId, name: input.name.trim() } },
        select: { id: true },
      });
      if (duplicate) throw new ConflictException('A webhook with this name already exists');
      const created = await transaction.webhookSubscription.create({
        data: {
          organizationId: principal.organizationId,
          workspaceId: principal.workspaceId,
          name: input.name.trim(),
          url,
          encryptedSecret: this.encrypt(secret),
          eventTypes,
        },
      });
      await this.audit.record(transaction, principal, {
        action: 'webhook.created',
        resourceType: 'webhook_subscription',
        resourceId: created.id,
        metadata: { url: created.url, eventTypes: created.eventTypes },
      });
      return { ...this.publicWebhook(created), secret };
    });
  }

  async listWebhooks(principal: Principal): Promise<PublicWebhook[]> {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) =>
      (await transaction.webhookSubscription.findMany({ orderBy: { createdAt: 'desc' } })).map((item) => this.publicWebhook(item)),
    );
  }

  async updateWebhook(principal: Principal, id: string, expectedVersion: number, input: UpdateWebhookSubscriptionDto): Promise<PublicWebhook> {
    this.assertAdmin(principal);
    if (Object.keys(input).length === 0) throw new BadRequestException('At least one webhook field must be supplied');
    const eventTypes = input.eventTypes === undefined ? undefined : this.normalizeEventTypes(input.eventTypes);
    const url = input.url === undefined ? undefined : this.validateWebhookUrl(input.url);

    return this.database.run(principal, async (transaction) => {
      const result = await transaction.webhookSubscription.updateMany({
        where: { id, version: expectedVersion },
        data: {
          version: { increment: 1 },
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(url !== undefined ? { url } : {}),
          ...(eventTypes !== undefined ? { eventTypes } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
      });
      if (result.count === 0) {
        const current = await transaction.webhookSubscription.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Webhook subscription not found');
        throw new ConflictException('Version conflict. Current version is ' + current.version);
      }
      const updated = await transaction.webhookSubscription.findUniqueOrThrow({ where: { id } });
      await this.audit.record(transaction, principal, {
        action: 'webhook.updated',
        resourceType: 'webhook_subscription',
        resourceId: id,
        metadata: { version: updated.version },
      });
      return this.publicWebhook(updated);
    });
  }

  async deleteWebhook(principal: Principal, id: string, expectedVersion: number): Promise<{ id: string }> {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const result = await transaction.webhookSubscription.deleteMany({ where: { id, version: expectedVersion } });
      if (result.count === 0) {
        const current = await transaction.webhookSubscription.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Webhook subscription not found');
        throw new ConflictException('Version conflict. Current version is ' + current.version);
      }
      await this.audit.record(transaction, principal, {
        action: 'webhook.deleted',
        resourceType: 'webhook_subscription',
        resourceId: id,
      });
      return { id };
    });
  }

  async listWebhookDeliveries(principal: Principal, subscriptionId: string) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const subscription = await transaction.webhookSubscription.findUnique({ where: { id: subscriptionId }, select: { id: true } });
      if (!subscription) throw new NotFoundException('Webhook subscription not found');
      return transaction.webhookDelivery.findMany({ where: { subscriptionId }, orderBy: { createdAt: 'desc' }, take: 100 });
    });
  }

  async replayWebhookDelivery(principal: Principal, deliveryId: string) {
    this.assertAdmin(principal);
    return this.database.run(principal, async (transaction) => {
      const current = await transaction.webhookDelivery.findUnique({ where: { id: deliveryId } });
      if (!current) throw new NotFoundException('Webhook delivery not found');
      if (!['FAILED', 'DEAD_LETTER'].includes(current.status)) throw new ConflictException('Only failed webhook deliveries can be replayed');
      const updated = await transaction.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: 'PENDING', attempts: 0, availableAt: new Date(), lockedAt: null, lockedBy: null, lastError: null, responseStatus: null },
      });
      await this.audit.record(transaction, principal, {
        action: 'webhook.delivery_replayed',
        resourceType: 'webhook_delivery',
        resourceId: deliveryId,
      });
      return updated;
    });
  }

  decryptWebhookSecret(encrypted: string): string {
    return this.decrypt(encrypted);
  }

  private publicApiKey(value: ApiKey): PublicApiKey {
    const { keyHash: _keyHash, ...safe } = value;
    return safe;
  }

  private publicWebhook(value: WebhookSubscription): PublicWebhook {
    const { encryptedSecret: _secret, ...safe } = value;
    return safe;
  }

  private assertAdmin(principal: Principal): void {
    if (!hasAnyRole(principal, ADMIN_ROLES)) throw new ForbiddenException('An owner or admin role is required');
  }

  private normalizeEventTypes(values: string[]): string[] {
    const normalized = [...new Set(values.map((value) => value.trim()))];
    if (normalized.length === 0 || normalized.some((value) => value.length > 160 || (value !== '*' && !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value)))) {
      throw new BadRequestException('eventTypes contains an invalid event name');
    }
    return normalized;
  }

  private validateWebhookUrl(raw: string): string {
    let parsed: URL;
    try { parsed = new URL(raw); } catch { throw new BadRequestException('Webhook URL is invalid'); }
    const production = this.config.get<string>('NODE_ENV') === 'production';
    if (production && parsed.protocol !== 'https:') throw new BadRequestException('Production webhook URLs must use HTTPS');
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new BadRequestException('Webhook URL must be a credential-free HTTP(S) URL');
    const host = parsed.hostname.toLowerCase().replace(/[.]$/, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || this.isPrivateIpLiteral(host)) {
      throw new BadRequestException('Webhook URL cannot target a local or private address');
    }
    return parsed.toString();
  }

  private isPrivateIpLiteral(host: string): boolean {
    const version = isIP(host);
    if (version === 4) {
      const [first = -1, second = -1] = host.split('.').map(Number);
      return (
        first === 10 ||
        first === 127 ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168) ||
        first === 0
      );
    }
    if (version === 6) {
      const n = host.toLowerCase();
      return n === '::1' || n === '::' || n.startsWith('fc') || n.startsWith('fd') || n.startsWith('fe8') || n.startsWith('fe9') || n.startsWith('fea') || n.startsWith('feb');
    }
    return false;
  }

  private encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv, tag, ciphertext].map((part) => part.toString('base64url')).join('.');
  }

  private decrypt(value: string): string {
    const [ivValue, tagValue, ciphertextValue] = value.split('.');
    if (!ivValue || !tagValue || !ciphertextValue) throw new Error('Encrypted webhook secret is malformed');
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, 'base64url')), decipher.final()]).toString('utf8');
  }
}
