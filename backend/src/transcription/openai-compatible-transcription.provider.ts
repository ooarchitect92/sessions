import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  normalizeSegments,
  TranscriptionProvider,
  type TranscriptionResult,
  type TranscriptionSource,
} from './transcription-provider';

interface ProviderResponse {
  text?: string;
  language?: string;
  segments?: Array<{
    start?: number;
    end?: number;
    text?: string;
    speaker?: string | null;
  }>;
}

@Injectable()
export class OpenAiCompatibleTranscriptionProvider extends TranscriptionProvider {
  readonly name = 'openai-compatible';

  constructor(private readonly config: ConfigService) {
    super();
  }

  async transcribe(source: TranscriptionSource): Promise<TranscriptionResult> {
    const apiKey = this.config.getOrThrow<string>('STT_API_KEY');
    const baseUrl = this.config
      .get<string>('STT_BASE_URL', 'https://api.openai.com/v1')
      .replace(/\/+$/, '');
    const model = this.config.getOrThrow<string>('STT_MODEL');

    const form = new FormData();
    const fileBytes = new Uint8Array(source.bytes.byteLength);
    fileBytes.set(source.bytes);
    form.append(
      'file',
      new Blob([fileBytes.buffer], {
        type: source.mimeType || 'application/octet-stream',
      }),
      source.filename,
    );
    form.append('model', model);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');
    if (source.languageHint) form.append('language', source.languageHint);

    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `STT provider returned ${response.status}${body ? `: ${body.slice(0, 500)}` : ''}`,
      );
    }

    const payload = (await response.json()) as ProviderResponse;
    const fullText = (payload.text ?? '').trim();
    const segments = normalizeSegments(fullText, payload.segments ?? []);
    const resolvedText =
      fullText || segments.map((segment) => segment.text).join(' ').trim();

    if (!resolvedText) {
      throw new Error('STT provider returned an empty transcript');
    }

    return {
      provider: this.name,
      language: payload.language ?? source.languageHint ?? null,
      fullText: resolvedText,
      segments,
    };
  }
}
