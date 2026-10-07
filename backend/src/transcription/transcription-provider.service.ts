import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  TranscriptionRequest,
  TranscriptionResult,
  TranscriptionSegmentResult,
} from './transcription.types';

interface OpenAiVerboseSegment {
  start?: number;
  end?: number;
  text?: string;
}

interface OpenAiVerboseResponse {
  language?: string;
  text?: string;
  segments?: OpenAiVerboseSegment[];
}

@Injectable()
export class TranscriptionProviderService {
  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return this.config.get<string>('STT_PROVIDER', 'disabled') !== 'disabled';
  }

  providerName(): string {
    return this.config.get<string>('STT_PROVIDER', 'disabled');
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    const provider = this.providerName();

    if (provider === 'mock') {
      return this.mockTranscription(request);
    }
    if (provider === 'openai') {
      return this.openAiTranscription(request);
    }

    throw new Error('stt_provider_disabled');
  }

  private mockTranscription(request: TranscriptionRequest): TranscriptionResult {
    const text = 'Mock transcript generated for local transcription pipeline validation.';
    return {
      provider: 'mock',
      language: request.language ?? 'en',
      fullText: text,
      segments: [
        {
          startMs: 0,
          endMs: 1000,
          speakerLabel: null,
          text,
        },
      ],
    };
  }

  private async openAiTranscription(
    request: TranscriptionRequest,
  ): Promise<TranscriptionResult> {
    const apiKey = this.config.getOrThrow<string>('STT_OPENAI_API_KEY');
    const endpoint = this.config.get<string>(
      'STT_OPENAI_ENDPOINT',
      'https://api.openai.com/v1/audio/transcriptions',
    );
    const model = this.config.get<string>('STT_OPENAI_MODEL', 'whisper-1');

    const form = new FormData();
    form.append(
      'file',
      new Blob([request.media], { type: request.mimeType }),
      request.filename,
    );
    form.append('model', model);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');
    if (request.language) form.append('language', request.language);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `stt_provider_http_${response.status}${body ? `:${body.slice(0, 300)}` : ''}`,
      );
    }

    const payload = (await response.json()) as OpenAiVerboseResponse;
    const rawSegments = payload.segments ?? [];
    const segments: TranscriptionSegmentResult[] = rawSegments
      .map((segment) => ({
        startMs: Math.max(0, Math.round((segment.start ?? 0) * 1000)),
        endMs: Math.max(0, Math.round((segment.end ?? segment.start ?? 0) * 1000)),
        speakerLabel: null,
        text: (segment.text ?? '').trim(),
      }))
      .filter((segment) => segment.text.length > 0);

    const fullText =
      (payload.text ?? '').trim() ||
      segments.map((segment) => segment.text).join(' ').trim();

    if (!fullText) throw new Error('stt_provider_empty_transcript');

    return {
      provider: `openai:${model}`,
      language: payload.language ?? request.language ?? null,
      fullText,
      segments:
        segments.length > 0
          ? segments
          : [
              {
                startMs: 0,
                endMs: 0,
                speakerLabel: null,
                text: fullText,
              },
            ],
    };
  }
}
