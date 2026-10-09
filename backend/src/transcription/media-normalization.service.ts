import { spawn } from 'node:child_process';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface NormalizedMedia {
  media: Buffer;
  mimeType: string;
  filename: string;
  normalized: boolean;
  provider: string;
}

@Injectable()
export class MediaNormalizationService {
  constructor(private readonly config: ConfigService) {}

  providerName(): string {
    return this.config.get<string>('STT_MEDIA_NORMALIZATION', 'disabled');
  }

  async normalize(input: {
    media: Buffer;
    mimeType: string;
    filename: string;
  }): Promise<NormalizedMedia> {
    const provider = this.providerName();
    if (provider === 'disabled') {
      return { ...input, normalized: false, provider };
    }
    if (provider !== 'ffmpeg') {
      throw new Error('media_normalization_provider_unsupported');
    }
    return this.ffmpegNormalize(input);
  }

  private async ffmpegNormalize(input: {
    media: Buffer;
    mimeType: string;
    filename: string;
  }): Promise<NormalizedMedia> {
    const timeoutMs = this.config.get<number>(
      'STT_MEDIA_NORMALIZATION_TIMEOUT_MS',
      60_000,
    );
    const maxOutputBytes = this.config.get<number>(
      'STT_MEDIA_NORMALIZATION_MAX_BYTES',
      50 * 1024 * 1024,
    );
    const binary = this.config.get<string>(
      'STT_FFMPEG_BINARY',
      'ffmpeg',
    );

    const output = await new Promise<Buffer>((resolve, reject) => {
      const child = spawn(
        binary,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          'pipe:0',
          '-map',
          '0:a:0',
          '-vn',
          '-ac',
          '1',
          '-ar',
          '16000',
          '-c:a',
          'pcm_s16le',
          '-f',
          'wav',
          'pipe:1',
        ],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );

      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let outputBytes = 0;
      let settled = false;

      const finish = (error?: Error, value?: Buffer) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(value ?? Buffer.alloc(0));
      };

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish(new Error('media_normalization_timeout'));
      }, timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        outputBytes += chunk.byteLength;
        if (outputBytes > maxOutputBytes) {
          child.kill('SIGKILL');
          finish(new Error('media_normalization_output_too_large'));
          return;
        }
        stdout.push(chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        if (Buffer.concat(stderr).byteLength < 4096) stderr.push(chunk);
      });
      child.on('error', (error) => {
        finish(
          new Error(
            `media_normalization_spawn_failed:${error.message.slice(0, 160)}`,
          ),
        );
      });
      child.on('close', (code) => {
        if (settled) return;
        if (code !== 0) {
          const detail = Buffer.concat(stderr)
            .toString('utf8')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 240);
          finish(
            new Error(
              `media_normalization_failed_${code ?? 'unknown'}${detail ? `:${detail}` : ''}`,
            ),
          );
          return;
        }
        const value = Buffer.concat(stdout);
        if (value.byteLength === 0) {
          finish(new Error('media_normalization_empty_output'));
          return;
        }
        finish(undefined, value);
      });

      child.stdin.on('error', () => {
        // A killed/failed ffmpeg process can close stdin before the write ends.
      });
      child.stdin.end(input.media);
    });

    return {
      media: output,
      mimeType: 'audio/wav',
      filename: input.filename.replace(/\.[^.]+$/, '') + '.wav',
      normalized: true,
      provider: 'ffmpeg:mono-16khz-pcm16',
    };
  }
}
