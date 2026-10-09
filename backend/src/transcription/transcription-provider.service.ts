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

interface HttpTranscriptionSegment {
  startMs?: unknown;
  endMs?: unknown;
  speakerLabel?: unknown;
  text?: unknown;
}

interface HttpTranscriptionResponse {
  provider?: unknown;
  language?: unknown;
  fullText?: unknown;
  segments?: unknown;
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
    if (provider === 'http') {
      return this.httpTranscription(request);
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

  private async httpTranscription(
    request: TranscriptionRequest,
  ): Promise<TranscriptionResult> {
    const endpoint = this.config.getOrThrow<string>('STT_HTTP_ENDPOINT');
    const apiKey = this.config.getOrThrow<string>('STT_HTTP_API_KEY');

    const form = new FormData();
    const mediaBytes = new Uint8Array(request.media.byteLength);
    mediaBytes.set(request.media);
    form.append(
      'file',
      new Blob([mediaBytes.buffer], { type: request.mimeType }),
      request.filename,
    );
    if (request.language) form.append('language', request.language);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });
    if (!response.ok) {
      throw new Error(`stt_http_provider_${response.status}`);
    }

    const payload = (await response.json()) as HttpTranscriptionResponse;
    const segmentsRaw = Array.isArray(payload.segments)
      ? (payload.segments as HttpTranscriptionSegment[])
      : [];
    const segments = segmentsRaw.flatMap((segment) => {
      if (
        typeof segment.startMs !== 'number' ||
        typeof segment.endMs !== 'number' ||
        typeof segment.text !== 'string' ||
        !segment.text.trim()
      ) {
        return [];
      }
      return [{
        startMs: Math.max(0, Math.round(segment.startMs)),
        endMs: Math.max(0, Math.round(segment.endMs)),
        speakerLabel:
          typeof segment.speakerLabel === 'string' &&
          segment.speakerLabel.trim()
            ? segment.speakerLabel.trim().slice(0, 160)
            : null,
        text: segment.text.trim(),
      }];
    });
    const fullText =
      typeof payload.fullText === 'string' && payload.fullText.trim()
        ? payload.fullText.trim()
        : segments.map((segment) => segment.text).join(' ').trim();
    if (!fullText) throw new Error('stt_provider_empty_transcript');

    return {
      provider:
        typeof payload.provider === 'string' && payload.provider.trim()
          ? `http:${payload.provider.trim().slice(0, 80)}`
          : 'http',
      language:
        typeof payload.language === 'string' && payload.language.trim()
          ? payload.language.trim()
          : request.language ?? null,
      fullText,
      segments:
        segments.length > 0
          ? segments
          : [{
              startMs: 0,
              endMs: 0,
              speakerLabel: null,
              text: fullText,
            }],
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
    const mediaBytes = new Uint8Array(request.media.byteLength);
    mediaBytes.set(request.media);
    form.append(
      'file',
      new Blob([mediaBytes.buffer], { type: request.mimeType }),
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
