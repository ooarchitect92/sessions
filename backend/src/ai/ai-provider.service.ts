import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgendaItemType } from '@prisma/client';
import type {
  AgendaDraftItem,
  AgendaDraftRequest,
  AgendaDraftResult,
  MeetingSummaryRequest,
  MeetingSummaryResult,
} from './ai.types';

interface OpenAiChoice {
  message?: {
    content?: string | null;
  };
}

interface OpenAiChatResponse {
  choices?: OpenAiChoice[];
}

interface ParsedSummary {
  summaryText?: unknown;
  decisions?: unknown;
  actionItems?: unknown;
  citations?: unknown;
}

interface ParsedAgenda {
  items?: unknown;
}

@Injectable()
export class AiProviderService {
  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return this.config.get<string>('AI_PROVIDER', 'disabled') !== 'disabled';
  }

  providerName(): string {
    return this.config.get<string>('AI_PROVIDER', 'disabled');
  }

  async summarize(request: MeetingSummaryRequest): Promise<MeetingSummaryResult> {
    const provider = this.providerName();
    if (provider === 'mock') return this.mockSummary(request);
    if (provider === 'openai') return this.openAiSummary(request);
    throw new Error('ai_provider_disabled');
  }

  async generateAgendaDraft(
    request: AgendaDraftRequest,
  ): Promise<AgendaDraftResult> {
    const provider = this.providerName();
    if (provider === 'mock') return this.mockAgenda(request);
    if (provider === 'openai') return this.openAiAgenda(request);
    throw new Error('ai_provider_disabled');
  }

  private mockSummary(request: MeetingSummaryRequest): MeetingSummaryResult {
    const compact = request.transcript.replace(/\s+/g, ' ').trim();
    const summaryText = compact
      ? compact.slice(0, 500)
      : 'No transcript content was available.';
    return {
      provider: 'mock',
      model: 'deterministic-local',
      summaryText,
      decisions: [],
      actionItems: [],
      citations: [],
    };
  }

  private mockAgenda(request: AgendaDraftRequest): AgendaDraftResult {
    const totalSeconds = Math.max(300, request.durationMinutes * 60);
    const intro = Math.max(60, Math.round(totalSeconds * 0.15));
    const close = Math.max(60, Math.round(totalSeconds * 0.15));
    const discussion = Math.max(60, totalSeconds - intro - close);
    return {
      provider: 'mock',
      model: 'deterministic-local',
      items: [
        {
          title: 'Welcome and objectives',
          durationSeconds: intro,
          type: AgendaItemType.TEXT,
          content: {
            note:
              request.prompt?.trim() ||
              request.description?.trim() ||
              `Align on the purpose of ${request.title}.`,
          },
        },
        {
          title: 'Main discussion',
          durationSeconds: discussion,
          type: AgendaItemType.TEXT,
          content: { note: 'Work through the primary discussion topics and questions.' },
        },
        {
          title: 'Decisions and next steps',
          durationSeconds: close,
          type: AgendaItemType.TEXT,
          content: { note: 'Confirm decisions, owners, due dates, and follow-up.' },
        },
      ],
    };
  }

  private async openAiSummary(
    request: MeetingSummaryRequest,
  ): Promise<MeetingSummaryResult> {
    const { content, model } = await this.chatJson([
      {
        role: 'system',
        content:
          'You summarize meeting transcripts. Return only JSON with keys summaryText, decisions, actionItems, citations. decisions must be an array of {text}. actionItems must be an array of {text, owner?, dueDate?}. citations must be an array of {quote, startMs?, endMs?}. Do not invent facts not present in the transcript.',
      },
      {
        role: 'user',
        content: `Meeting title: ${request.title}\n\nTranscript:\n${request.transcript}`,
      },
    ]);

    let parsed: ParsedSummary;
    try {
      parsed = JSON.parse(content) as ParsedSummary;
    } catch {
      throw new Error('ai_provider_invalid_json');
    }

    const summaryText =
      typeof parsed.summaryText === 'string' ? parsed.summaryText.trim() : '';
    if (!summaryText) throw new Error('ai_provider_missing_summary');

    return {
      provider: 'openai',
      model,
      summaryText,
      decisions: this.objectArray(parsed.decisions, ['text']) as Array<{
        text: string;
      }>,
      actionItems: this.objectArray(parsed.actionItems, ['text']) as Array<{
        text: string;
        owner?: string | null;
        dueDate?: string | null;
      }>,
      citations: this.objectArray(parsed.citations, ['quote']) as Array<{
        quote: string;
        startMs?: number | null;
        endMs?: number | null;
      }>,
    };
  }

  private async openAiAgenda(
    request: AgendaDraftRequest,
  ): Promise<AgendaDraftResult> {
    const allowedTypes = Object.values(AgendaItemType).join(', ');
    const { content, model } = await this.chatJson([
      {
        role: 'system',
        content:
          `You generate draft meeting agendas for human review. Return only JSON with key items. items must contain 3-12 objects with title, durationSeconds, type, content. Allowed type values: ${allowedTypes}. content must be a JSON object. Keep the total agenda duration close to the requested meeting duration and never exceed 24 hours. Do not claim that the agenda is final or automatically approved.`,
      },
      {
        role: 'user',
        content: [
          `Meeting title: ${request.title}`,
          `Description: ${request.description ?? ''}`,
          `Duration minutes: ${request.durationMinutes}`,
          `Host guidance: ${request.prompt ?? ''}`,
        ].join('\n'),
      },
    ]);

    let parsed: ParsedAgenda;
    try {
      parsed = JSON.parse(content) as ParsedAgenda;
    } catch {
      throw new Error('ai_provider_invalid_json');
    }

    const items = this.agendaItems(parsed.items);
    if (items.length === 0) throw new Error('ai_provider_missing_agenda_items');

    return {
      provider: 'openai',
      model,
      items,
    };
  }

  private async chatJson(
    messages: Array<{ role: 'system' | 'user'; content: string }>,
  ): Promise<{ content: string; model: string }> {
    const apiKey = this.config.getOrThrow<string>('AI_OPENAI_API_KEY');
    const endpoint = this.config.get<string>(
      'AI_OPENAI_ENDPOINT',
      'https://api.openai.com/v1/chat/completions',
    );
    const model = this.config.get<string>('AI_OPENAI_MODEL', 'gpt-4o-mini');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `ai_provider_http_${response.status}${body ? `:${body.slice(0, 300)}` : ''}`,
      );
    }

    const payload = (await response.json()) as OpenAiChatResponse;
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('ai_provider_empty_response');
    return { content, model };
  }

  private agendaItems(value: unknown): AgendaDraftItem[] {
    if (!Array.isArray(value)) return [];
    const allowed = new Set(Object.values(AgendaItemType));

    return value
      .slice(0, 12)
      .flatMap((entry): AgendaDraftItem[] => {
        if (!entry || typeof entry !== 'object') return [];
        const item = entry as Record<string, unknown>;
        const title = typeof item.title === 'string' ? item.title.trim() : '';
        const durationSeconds = Number(item.durationSeconds);
        const type =
          typeof item.type === 'string' && allowed.has(item.type as AgendaItemType)
            ? (item.type as AgendaItemType)
            : AgendaItemType.TEXT;
        const content =
          item.content &&
          typeof item.content === 'object' &&
          !Array.isArray(item.content)
            ? (item.content as Record<string, unknown>)
            : {};

        if (
          !title ||
          title.length > 160 ||
          !Number.isInteger(durationSeconds) ||
          durationSeconds < 0 ||
          durationSeconds > 86400
        ) {
          return [];
        }

        return [{ title, durationSeconds, type, content }];
      });
  }

  private objectArray(
    value: unknown,
    requiredKeys: string[],
  ): Array<Record<string, string | number | null>> {
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) &&
          typeof item === 'object' &&
          requiredKeys.every(
            (key) =>
              typeof (item as Record<string, unknown>)[key] === 'string' &&
              String((item as Record<string, unknown>)[key]).trim().length > 0,
          ),
      )
      .map((item) => {
        const normalized: Record<string, string | number | null> = {};
        for (const [key, entry] of Object.entries(item)) {
          if (typeof entry === 'string') normalized[key] = entry.trim();
          else if (typeof entry === 'number' && Number.isFinite(entry)) {
            normalized[key] = entry;
          } else if (entry === null) normalized[key] = null;
        }
        return normalized;
      });
  }
}
