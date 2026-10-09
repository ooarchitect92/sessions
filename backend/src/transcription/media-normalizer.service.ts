import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface NormalizedMedia {
  media: Buffer;
  mimeType: string;
  filename: string;
  normalized: boolean;
  metadata: {
    sourceMimeType: string;
    outputMimeType: string;
    sampleRateHz?: number;
    channels?: number;
  };
}

@Injectable()
export class MediaNormalizerService {
  constructor(private readonly config: ConfigService) {}

  async normalize(input: {
    media: Buffer;
    mimeType: string;
    filename: string;
  }): Promise<NormalizedMedia> {
    const mode = this.config.get<string>('STT_MEDIA_NORMALIZATION', 'disabled');
    if (mode === 'disabled') {
      return {
        ...input,
        normalized: false,
        metadata: {
          sourceMimeType: input.mimeType,
          outputMimeType: input.mimeType,
        },
      };
    }

    if (mode !== 'ffmpeg') throw new Error('stt_media_normalization_invalid_mode');

    const dir = await mkdtemp(join(tmpdir(), 'sessions-stt-'));
    const sourcePath = join(dir, this.safeFilename(input.filename) || 'source.bin');
    const outputPath = join(dir, 'normalized.wav');
    const ffmpeg = this.config.get<string>('FFMPEG_PATH', 'ffmpeg');
    const timeoutMs = this.config.get<number>('STT_NORMALIZATION_TIMEOUT_MS', 120000);
    const maxOutputBytes = this.config.get<number>(
      'STT_NORMALIZED_MAX_BYTES',
      100 * 1024 * 1024,
    );

    try {
      await writeFile(sourcePath, input.media);
      await this.runFfmpeg(
        ffmpeg,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-i',
          sourcePath,
          '-vn',
          '-ac',
          '1',
          '-ar',
          '16000',
          '-c:a',
          'pcm_s16le',
          outputPath,
        ],
        timeoutMs,
      );
      const media = await readFile(outputPath);
      if (media.byteLength === 0) throw new Error('stt_normalization_empty_output');
      if (media.byteLength > maxOutputBytes) {
        throw new Error('stt_normalization_output_too_large');
      }
      return {
        media,
        mimeType: 'audio/wav',
        filename: 'normalized.wav',
        normalized: true,
        metadata: {
          sourceMimeType: input.mimeType,
          outputMimeType: 'audio/wav',
          sampleRateHz: 16000,
          channels: 1,
        },
      };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private runFfmpeg(
    executable: string,
    args: string[],
    timeoutMs: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('stt_normalization_timeout'));
      }, timeoutMs);

      child.stderr.on('data', (chunk: Buffer | string) => {
        if (stderr.length < 2000) stderr += chunk.toString();
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(new Error(`stt_normalization_spawn_failed:${error.message}`));
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`stt_normalization_ffmpeg_${code}:${stderr.slice(0, 500)}`));
      });
    });
  }

  private safeFilename(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  }
}
