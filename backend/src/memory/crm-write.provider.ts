import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderConnectionKind } from '@prisma/client';
import { createHash } from 'node:crypto';
import { ProviderConnectionsService } from '../integrations/provider-connections.service';
import { WebhookHttpClient } from '../integrations/webhook-http.client';

export interface CrmWriteRequest {
  organizationId: string;
  workspaceId: string;
  targetProvider: string;
  targetRecordId: string;
  note: string;
  idempotencyKey: string;
}

export interface CrmWriteResult {
  provider: string;
  referenceId: string;
}

@Injectable()
export class CrmWriteProvider {
  constructor(
    private readonly config: ConfigService,
    private readonly providerConnections: ProviderConnectionsService,
    private readonly http: WebhookHttpClient,
  ) {}

  providerName(): string {
    return this.config.get<string>('CRM_WRITE_PROVIDER', 'disabled');
  }

  async writeNote(request: CrmWriteRequest): Promise<CrmWriteResult> {
    const managed = await this.providerConnections.resolveActiveCredential(
      request.organizationId,
      request.workspaceId,
      ProviderConnectionKind.CRM_HTTP,
    );
    if (managed) {
      try {
        const response = await this.http.post(
          managed.endpointUrl,
          JSON.stringify({
            targetProvider: request.targetProvider,
            targetRecordId: request.targetRecordId,
            note: request.note,
          }),
          {
            authorization: `Bearer ${managed.secret}`,
            'idempotency-key': request.idempotencyKey,
          },
        );
        if (response.statusCode < 200 || response.statusCode >= 300) {
          throw new Error(`crm_write_provider_http_${response.statusCode}`);
        }
        await this.providerConnections.recordExecution(managed.id, true);
        const payload = this.parsePayload(response.bodySnippet);
        return {
          provider: 'workspace_crm_http',
          referenceId:
            payload?.id ??
            payload?.referenceId ??
            createHash('sha256')
              .update(request.idempotencyKey)
              .digest('hex'),
        };
      } catch (error: unknown) {
        await this.providerConnections.recordExecution(
          managed.id,
          false,
          error instanceof Error ? error.message : 'crm_write_provider_failed',
        );
        throw error;
      }
    }

    const provider = this.providerName();
    if (provider === 'disabled') throw new Error('crm_write_provider_disabled');
    if (provider === 'mock') {
      return {
        provider: 'mock',
        referenceId: createHash('sha256')
          .update(request.idempotencyKey)
          .digest('hex')
          .slice(0, 32),
      };
    }

    const endpoint = this.config.get<string>('CRM_WRITE_HTTP_ENDPOINT');
    const apiKey = this.config.get<string>('CRM_WRITE_HTTP_API_KEY');
    if (!endpoint || !apiKey) {
      throw new Error('crm_write_http_provider_not_configured');
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'idempotency-key': request.idempotencyKey,
      },
      body: JSON.stringify({
        targetProvider: request.targetProvider,
        targetRecordId: request.targetRecordId,
        note: request.note,
      }),
    });
    if (!response.ok) {
      throw new Error(`crm_write_provider_http_${response.status}`);
    }
    const payload = (await response.json().catch(() => null)) as
      | { id?: string; referenceId?: string }
      | null;
    return {
      provider: 'http',
      referenceId:
        payload?.id ??
        payload?.referenceId ??
        createHash('sha256').update(request.idempotencyKey).digest('hex'),
    };
  }

  private parsePayload(
    value: string,
  ): { id?: string; referenceId?: string } | null {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return {
        ...(typeof parsed.id === 'string' ? { id: parsed.id } : {}),
        ...(typeof parsed.referenceId === 'string'
          ? { referenceId: parsed.referenceId }
          : {}),
      };
    } catch {
      return null;
    }
  }
}
