import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MemoryGenerationProvider,
  normalizeMemoryGeneration,
  type MemoryGenerationInput,
  type MemoryGenerationResult,
} from './memory-generation-provider';

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

@Injectable()
export class OpenAiCompatibleMemoryProvider extends MemoryGenerationProvider {
  readonly name = 'openai-compatible';

  constructor(private readonly config: ConfigService) {
    super();
  }

  async generate(input: MemoryGenerationInput): Promise<MemoryGenerationResult> {
    const apiKey = this.config.getOrThrow<string>('AI_API_KEY');
    const baseUrl = this.config
      .get<string>('AI_BASE_URL', 'https://api.openai.com/v1')
      .replace(/\/+$/, '');
    const model = this.config.getOrThrow<string>('AI_MODEL');
    const maxChars = this.config.get<number>('AI_MAX_TRANSCRIPT_CHARS', 120_000);

    const segmentContext = input.transcriptSegments
      .map(
        (segment) =>
          `[${segment.position}] ${segment.startMs}-${segment.endMs}ms ${segment.speakerLabel ?? 'Speaker'}: ${segment.text}`,
      )
      .join('\n')
      .slice(0, maxChars);

    const prompt = [
      `Meeting title: ${input.sessionTitle}`,
      '',
      'Create a factual meeting-memory record from the transcript below.',
      'Do not invent decisions, owners, deadlines, or facts.',
      'Return ONLY valid JSON with this exact shape:',
      '{"summaryText":"string","decisions":["string"],"actionItems":[{"title":"string","owner":"string|null","dueDate":"string|null"}],"citations":[{"segmentPosition":0,"startMs":0,"endMs":0,"reason":"string|null"}]}',
      'Citations must reference transcript segment positions that directly support important claims.',
      '',
      'Transcript:',
      segmentContext || input.transcriptText.slice(0, maxChars),
    ].join('\n');

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You generate reviewable meeting summaries grounded only in the provided transcript.',
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

    const normalized = normalizeMemoryGeneration(parsed);
    if (!normalized.summaryText) {
      throw new Error('AI provider returned an empty summary');
    }

    return {
      provider: this.name,
      model,
      ...normalized,
    };
  }
}
