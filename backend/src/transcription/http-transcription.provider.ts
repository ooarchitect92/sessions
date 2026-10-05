import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  TranscriptSegmentResult,
  TranscriptionProvider,
  TranscriptionRequest,
  TranscriptionResult,
} from './transcription.types';

interface ProviderSegment {
  startMs?: unknown;
  endMs?: unknown;
  start?: unknown;
  end?: unknown;
  speakerLabel?: unknown;
  speaker?: unknown;
  text?: unknown;
}

interface ProviderResponse {
  text?: unknown;
  language?: unknown;
  segments?: unknown;
}

@Injectable()
export class HttpTranscriptionProvider implements TranscriptionProvider {
  readonly name = 'http';

  constructor(private readonly config: ConfigService) {}

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    const endpoint = this.config.getOrThrow<string>('STT_HTTP_ENDPOINT');
    const model = this.config.get<string>('STT_MODEL', 'default');
    const apiKey = this.config.get<string>('STT_API_KEY');

    const form = new FormData();
    form.set(
      'file',
      new Blob([request.audio], { type: request.mimeType }),
      request.filename,
    );
    form.set('model', model);
    form.set('response_format', 'verbose_json');
    if (request.language) form.set('language', request.language);

    const headers: Record<string, string> = {};
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: form,
      signal: AbortSignal.timeout(
        this.config.get<number>('STT_REQUEST_TIMEOUT_MS', 120_000),
      ),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `STT provider returned ${response.status}${body ? `: ${body.slice(0, 500)}` : ''}`,
      );
    }

    const payload = (await response.json()) as ProviderResponse;
    return this.normalize(payload);
  }

  normalize(payload: ProviderResponse): TranscriptionResult {
    const text = typeof payload.text === 'string' ? payload.text.trim() : '';
    const rawSegments = Array.isArray(payload.segments) ? payload.segments : [];
    const segments = rawSegments
      .map((segment, position) => this.normalizeSegment(segment, position))
      .filter((segment): segment is TranscriptSegmentResult => Boolean(segment));

    const effectiveText =
      text || segments.map((segment) => segment.text).join(' ').trim();
    if (!effectiveText) {
      throw new Error('STT provider response did not contain transcript text');
    }

    return {
      provider: this.name,
      language:
        typeof payload.language === 'string' && payload.language.trim()
          ? payload.language.trim().slice(0, 32)
          : undefined,
      text: effectiveText,
      segments:
        segments.length > 0
          ? segments
          : [
              {
                startMs: 0,
                endMs: 0,
                text: effectiveText,
              },
            ],
    };
  }

  private normalizeSegment(
    value: unknown,
    position: number,
  ): TranscriptSegmentResult | null {
    if (!value || typeof value !== 'object') return null;
    const segment = value as ProviderSegment;
    const text = typeof segment.text === 'string' ? segment.text.trim() : '';
    if (!text) return null;

    const startMs = this.timeToMs(segment.startMs, segment.start);
    const endMs = Math.max(
      startMs,
      this.timeToMs(segment.endMs, segment.end, startMs),
    );
    const speaker =
      typeof segment.speakerLabel === 'string'
        ? segment.speakerLabel
        : typeof segment.speaker === 'string'
          ? segment.speaker
          : undefined;

    return {
      startMs,
      endMs,
      ...(speaker?.trim()
        ? { speakerLabel: speaker.trim().slice(0, 160) }
        : {}),
      text,
    };
  }

  private timeToMs(
    millisecondValue: unknown,
    secondValue: unknown,
    fallback = 0,
  ): number {
    if (
      typeof millisecondValue === 'number' &&
      Number.isFinite(millisecondValue)
    ) {
      return Math.max(0, Math.round(millisecondValue));
    }
    if (typeof secondValue === 'number' && Number.isFinite(secondValue)) {
      return Math.max(0, Math.round(secondValue * 1000));
    }
    return fallback;
  }
}
