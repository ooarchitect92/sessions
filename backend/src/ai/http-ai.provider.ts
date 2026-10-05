import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AiActionItem,
  AiCitation,
  AiDecision,
  MeetingAiProvider,
  MeetingSummaryRequest,
  MeetingSummaryResult,
} from './ai.types';

interface ProviderResponse {
  summary?: unknown;
  decisions?: unknown;
  actionItems?: unknown;
  citations?: unknown;
  model?: unknown;
}

@Injectable()
export class HttpAiProvider implements MeetingAiProvider {
  readonly name = 'http';

  constructor(private readonly config: ConfigService) {}

  async summarize(request: MeetingSummaryRequest): Promise<MeetingSummaryResult> {
    const endpoint = this.config.getOrThrow<string>('AI_HTTP_ENDPOINT');
    const model = this.config.get<string>('AI_MODEL', 'default');
    const apiKey = this.config.get<string>('AI_API_KEY');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        task: 'meeting_summary',
        input: request,
        outputSchema: {
          summary: 'string',
          decisions: [
            {
              text: 'string',
              citations: [{ segmentPosition: 'number', quote: 'string?' }],
            },
          ],
          actionItems: [
            {
              text: 'string',
              owner: 'string?',
              dueDate: 'string?',
              citations: [{ segmentPosition: 'number', quote: 'string?' }],
            },
          ],
          citations: [{ segmentPosition: 'number', quote: 'string?' }],
        },
      }),
      signal: AbortSignal.timeout(
        this.config.get<number>('AI_REQUEST_TIMEOUT_MS', 120_000),
      ),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `AI provider returned ${response.status}${body ? `: ${body.slice(0, 500)}` : ''}`,
      );
    }

    return this.normalize(
      (await response.json()) as ProviderResponse,
      model,
      request.segments.length,
    );
  }

  normalize(
    payload: ProviderResponse,
    fallbackModel = 'default',
    segmentCount = Number.MAX_SAFE_INTEGER,
  ): MeetingSummaryResult {
    const summary =
      typeof payload.summary === 'string' ? payload.summary.trim() : '';
    if (!summary) {
      throw new Error('AI provider response did not contain a summary');
    }

    return {
      provider: this.name,
      model:
        typeof payload.model === 'string' && payload.model.trim()
          ? payload.model.trim().slice(0, 160)
          : fallbackModel,
      summary,
      decisions: this.normalizeDecisions(payload.decisions, segmentCount),
      actionItems: this.normalizeActionItems(
        payload.actionItems,
        segmentCount,
      ),
      citations: this.normalizeCitations(payload.citations, segmentCount),
    };
  }

  private normalizeDecisions(value: unknown, segmentCount: number): AiDecision[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const raw = item as Record<string, unknown>;
      const text = typeof raw.text === 'string' ? raw.text.trim() : '';
      if (!text) return [];
      return [
        {
          text: text.slice(0, 4000),
          citations: this.normalizeCitations(raw.citations, segmentCount),
        },
      ];
    });
  }

  private normalizeActionItems(
    value: unknown,
    segmentCount: number,
  ): AiActionItem[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const raw = item as Record<string, unknown>;
      const text = typeof raw.text === 'string' ? raw.text.trim() : '';
      if (!text) return [];
      const owner =
        typeof raw.owner === 'string' && raw.owner.trim()
          ? raw.owner.trim().slice(0, 320)
          : undefined;
      const dueDate =
        typeof raw.dueDate === 'string' && raw.dueDate.trim()
          ? raw.dueDate.trim().slice(0, 100)
          : undefined;
      return [
        {
          text: text.slice(0, 4000),
          ...(owner ? { owner } : {}),
          ...(dueDate ? { dueDate } : {}),
          citations: this.normalizeCitations(raw.citations, segmentCount),
        },
      ];
    });
  }

  private normalizeCitations(
    value: unknown,
    segmentCount: number,
  ): AiCitation[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<number>();
    return value.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const raw = item as Record<string, unknown>;
      const position =
        typeof raw.segmentPosition === 'number'
          ? Math.trunc(raw.segmentPosition)
          : Number.NaN;
      if (
        !Number.isInteger(position) ||
        position < 0 ||
        position >= segmentCount ||
        seen.has(position)
      ) {
        return [];
      }
      seen.add(position);
      const quote =
        typeof raw.quote === 'string' && raw.quote.trim()
          ? raw.quote.trim().slice(0, 500)
          : undefined;
      return [
        {
          segmentPosition: position,
          ...(quote ? { quote } : {}),
        },
      ];
    });
  }
}
