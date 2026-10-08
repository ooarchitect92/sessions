import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CrmWriteRequest {
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
  constructor(private readonly config: ConfigService) {}

  providerName(): string {
    return this.config.get<string>('CRM_WRITE_PROVIDER', 'disabled');
  }

  async writeNote(request: CrmWriteRequest): Promise<CrmWriteResult> {
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
}
