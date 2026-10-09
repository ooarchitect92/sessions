import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  TranscriptionResult,
  TranscriptionSegmentResult,
} from './transcription.types';

interface DiarizationHttpResponse {
  segments?: Array<{
    position?: number;
    speakerLabel?: string | null;
  }>;
}

@Injectable()
export class DiarizationProviderService {
  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return this.providerName() !== 'disabled';
  }

  providerName(): string {
    return this.config.get<string>('STT_DIARIZATION_PROVIDER', 'disabled');
  }

  async diarize(input: {
    media: Buffer;
    mimeType: string;
    filename: string;
    transcription: TranscriptionResult;
  }): Promise<TranscriptionResult> {
    const provider = this.providerName();
    if (provider === 'disabled') return input.transcription;
    if (provider === 'mock') return this.mockDiarization(input.transcription);
    if (provider === 'http') return this.httpDiarization(input);
    throw new Error('diarization_provider_unsupported');
  }

  private mockDiarization(
    transcription: TranscriptionResult,
  ): TranscriptionResult {
    return {
      ...transcription,
      provider: `${transcription.provider}+diarization:mock`,
      segments: transcription.segments.map((segment) => ({
        ...segment,
        speakerLabel: segment.speakerLabel ?? 'Speaker 1',
      })),
    };
  }

  private async httpDiarization(input: {
    media: Buffer;
    mimeType: string;
    filename: string;
    transcription: TranscriptionResult;
  }): Promise<TranscriptionResult> {
    const endpoint = this.config.getOrThrow<string>(
      'STT_DIARIZATION_HTTP_ENDPOINT',
    );
    const apiKey = this.config.getOrThrow<string>(
      'STT_DIARIZATION_HTTP_API_KEY',
    );
    const timeoutMs = this.config.get<number>(
      'STT_DIARIZATION_TIMEOUT_MS',
      60_000,
    );

    const mediaBytes = new Uint8Array(input.media.byteLength);
    mediaBytes.set(input.media);
    const form = new FormData();
    form.append(
      'file',
      new Blob([mediaBytes.buffer], { type: input.mimeType }),
      input.filename,
    );
    form.append(
      'segments',
      JSON.stringify(
        input.transcription.segments.map((segment, position) => ({
          position,
          startMs: segment.startMs,
          endMs: segment.endMs,
          text: segment.text,
        })),
      ),
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: controller.signal,
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('diarization_provider_timeout');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `diarization_provider_http_${response.status}${body ? `:${body.slice(0, 240)}` : ''}`,
      );
    }

    const payload = (await response.json()) as DiarizationHttpResponse;
    const labels = new Map<number, string>();
    for (const item of payload.segments ?? []) {
      if (
        !Number.isInteger(item.position) ||
        item.position === undefined ||
        item.position < 0 ||
        item.position >= input.transcription.segments.length
      ) {
        continue;
      }
      const label =
        typeof item.speakerLabel === 'string'
          ? item.speakerLabel.trim().slice(0, 120)
          : '';
      if (label) labels.set(item.position, label);
    }

    if (labels.size === 0) {
      throw new Error('diarization_provider_missing_speaker_labels');
    }

    const segments: TranscriptionSegmentResult[] =
      input.transcription.segments.map((segment, position) => ({
        ...segment,
        speakerLabel: labels.get(position) ?? segment.speakerLabel ?? null,
      }));

    return {
      ...input.transcription,
      provider: `${input.transcription.provider}+diarization:http`,
      segments,
    };
  }
}
