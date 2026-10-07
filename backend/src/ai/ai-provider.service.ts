import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MeetingSummaryRequest, MeetingSummaryResult } from './ai.types';

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

  private async openAiSummary(
    request: MeetingSummaryRequest,
  ): Promise<MeetingSummaryResult> {
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
        messages: [
          {
            role: 'system',
            content:
              'You summarize meeting transcripts. Return only JSON with keys summaryText, decisions, actionItems, citations. decisions must be an array of {text}. actionItems must be an array of {text, owner?, dueDate?}. citations must be an array of {quote, startMs?, endMs?}. Do not invent facts not present in the transcript.',
          },
          {
            role: 'user',
            content: `Meeting title: ${request.title}\n\nTranscript:\n${request.transcript}`,
          },
        ],
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
