import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AgendaGenerationProvider,
  normalizeAgendaSuggestions,
  type AgendaGenerationInput,
  type AgendaGenerationResult,
} from './agenda-generation-provider';

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

@Injectable()
export class OpenAiCompatibleAgendaProvider extends AgendaGenerationProvider {
  readonly name = 'openai-compatible';

  constructor(private readonly config: ConfigService) {
    super();
  }

  async generate(input: AgendaGenerationInput): Promise<AgendaGenerationResult> {
    const apiKey = this.config.getOrThrow<string>('AI_API_KEY');
    const baseUrl = this.config
      .get<string>('AI_BASE_URL', 'https://api.openai.com/v1')
      .replace(/\/+$/, '');
    const model = this.config.getOrThrow<string>('AI_MODEL');

    const prompt = [
      `Meeting title: ${input.sessionTitle}`,
      `Meeting description: ${input.sessionDescription ?? 'Not provided'}`,
      `Total duration: ${input.durationMinutes} minutes`,
      `Desired agenda items: ${input.desiredItems}`,
      `Host objective: ${input.objective}`,
      '',
      'Create a practical meeting agenda draft for human review.',
      'Use only these item types: TEXT, POLL, QA, BREAKOUT.',
      'Do not invent links, participants, customer facts, decisions, or commitments.',
      'Keep the total suggested duration within the meeting duration.',
      'Return ONLY valid JSON:',
      '{"items":[{"title":"string","durationMinutes":10,"type":"TEXT","notes":"string"}]}',
    ].join('\n');

    const response = await fetch(`${baseUrl}/chat/completions`, {
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
              'You create concise, reviewable meeting agenda drafts. Never perform external actions.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `AI provider returned ${response.status}${body ? `: ${body.slice(0, 500)}` : ''}`,
      );
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('AI provider returned an empty response');

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error('AI provider returned invalid JSON');
    }

    const items = normalizeAgendaSuggestions(
      parsed,
      input.durationMinutes,
      input.desiredItems,
    );
    if (items.length === 0) {
      throw new Error('AI provider returned no usable agenda items');
    }

    return { provider: this.name, model, items };
  }
}
