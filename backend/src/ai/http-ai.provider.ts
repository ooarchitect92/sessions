import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AgendaAiProvider,
  AgendaDraftItem,
  AgendaDraftRequest,
  AgendaDraftResult,
  FollowUpAiProvider,
  FollowUpDraftRequest,
  FollowUpDraftResult,
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
  items?: unknown;
  model?: unknown;
}

const AGENDA_ITEM_TYPES = new Set([
  'TEXT',
  'PRESENTATION',
  'WEBSITE',
  'VIDEO',
  'POLL',
  'WHITEBOARD',
  'BREAKOUT',
  'QA',
  'SCREEN_SHARE',
]);

@Injectable()
export class HttpAiProvider
  implements MeetingAiProvider, AgendaAiProvider, FollowUpAiProvider
{
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

  async draftFollowUp(
    request: FollowUpDraftRequest,
  ): Promise<FollowUpDraftResult> {
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
        task: 'meeting_follow_up_email',
        input: request,
        outputSchema: {
          subject: 'string',
          body: 'string',
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

    const payload = (await response.json()) as ProviderResponse & {
      subject?: unknown;
      body?: unknown;
    };
    const subject =
      typeof payload.subject === 'string' ? payload.subject.trim() : '';
    const body = typeof payload.body === 'string' ? payload.body.trim() : '';
    if (!subject || !body) {
      throw new Error('AI provider response did not contain a follow-up draft');
    }

    return {
      provider: this.name,
      model:
        typeof payload.model === 'string' && payload.model.trim()
          ? payload.model.trim().slice(0, 160)
          : model,
      subject: subject.slice(0, 300),
      body: body.slice(0, 20000),
    };
  }

  async generateAgenda(request: AgendaDraftRequest): Promise<AgendaDraftResult> {
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
        task: 'agenda_draft',
        input: request,
        outputSchema: {
          items: [
            {
              title: 'string',
              durationSeconds: 'number',
              type: 'TEXT|PRESENTATION|WEBSITE|VIDEO|POLL|WHITEBOARD|BREAKOUT|QA|SCREEN_SHARE',
              content: 'object',
              rationale: 'string?',
            },
          ],
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

    return this.normalizeAgenda(
      (await response.json()) as ProviderResponse,
      model,
      request.durationMinutes,
    );
  }

  normalizeAgenda(
    payload: ProviderResponse,
    fallbackModel = 'default',
    targetDurationMinutes = 30,
  ): AgendaDraftResult {
    if (!Array.isArray(payload.items)) {
      throw new Error('AI provider response did not contain agenda items');
    }

    const items = payload.items.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const raw = item as Record<string, unknown>;
      const title = typeof raw.title === 'string' ? raw.title.trim() : '';
      const durationSeconds =
        typeof raw.durationSeconds === 'number'
          ? Math.trunc(raw.durationSeconds)
          : Number.NaN;
      const type = typeof raw.type === 'string' ? raw.type : '';
      if (
        !title ||
        !Number.isInteger(durationSeconds) ||
        durationSeconds < 30 ||
        durationSeconds > 86400 ||
        !AGENDA_ITEM_TYPES.has(type)
      ) {
        return [];
      }
      const content =
        raw.content && typeof raw.content === 'object' && !Array.isArray(raw.content)
          ? (raw.content as Record<string, unknown>)
          : {};
      const rationale =
        typeof raw.rationale === 'string' && raw.rationale.trim()
          ? raw.rationale.trim().slice(0, 1000)
          : undefined;
      return [
        {
          title: title.slice(0, 160),
          durationSeconds,
          type: type as AgendaDraftItem['type'],
          content,
          ...(rationale ? { rationale } : {}),
        },
      ];
    });

    if (items.length === 0) {
      throw new Error('AI provider response did not contain valid agenda items');
    }

    const maxSeconds = Math.max(300, targetDurationMinutes * 60 * 1.25);
    const bounded: AgendaDraftItem[] = [];
    let usedSeconds = 0;
    for (const item of items.slice(0, 50)) {
      if (bounded.length > 0 && usedSeconds + item.durationSeconds > maxSeconds) {
        break;
      }
      bounded.push(item);
      usedSeconds += item.durationSeconds;
    }

    return {
      provider: this.name,
      model:
        typeof payload.model === 'string' && payload.model.trim()
          ? payload.model.trim().slice(0, 160)
          : fallbackModel,
      items: bounded.length > 0 ? bounded : [items[0]!],
    };
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
