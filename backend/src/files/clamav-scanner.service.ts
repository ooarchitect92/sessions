import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'node:net';

export interface MalwareScanResult {
  clean: boolean;
  signature: string | null;
  raw: string;
}

@Injectable()
export class ClamAvScannerService {
  constructor(private readonly config: ConfigService) {}

  async scan(bytes: Uint8Array): Promise<MalwareScanResult> {
    const host = this.config.get<string>('FILE_SCAN_HOST', '127.0.0.1');
    const port = this.config.get<number>('FILE_SCAN_PORT', 3310);
    const timeoutMs = this.config.get<number>('FILE_SCAN_TIMEOUT_MS', 15_000);

    return new Promise<MalwareScanResult>((resolve, reject) => {
      const socket = new Socket();
      let response = '';
      let settled = false;

      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        callback();
      };

      socket.setTimeout(timeoutMs);
      socket.on('timeout', () =>
        finish(() => reject(new Error('ClamAV scan timed out'))),
      );
      socket.on('error', (error) => finish(() => reject(error)));
      socket.on('data', (chunk) => {
        response += chunk.toString('utf8');
      });
      socket.on('close', () => {
        if (settled) return;
        const raw = response.trim();
        const found = raw.match(/stream:\s+(.+)\s+FOUND$/i);
        if (/stream:\s+OK$/i.test(raw)) {
          finish(() => resolve({ clean: true, signature: null, raw }));
          return;
        }
        if (found) {
          finish(() =>
            resolve({
              clean: false,
              signature: found[1]?.trim() || 'malware-detected',
              raw,
            }),
          );
          return;
        }
        finish(() =>
          reject(new Error(`Unexpected ClamAV response: ${raw || 'empty'}`)),
        );
      });

      socket.connect(port, host, () => {
        socket.write(Buffer.from('zINSTREAM\0', 'utf8'));
        const chunkSize = 64 * 1024;
        for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
          const chunk = bytes.subarray(offset, Math.min(bytes.byteLength, offset + chunkSize));
          const length = Buffer.allocUnsafe(4);
          length.writeUInt32BE(chunk.byteLength, 0);
          socket.write(length);
          socket.write(Buffer.from(chunk));
        }
        const end = Buffer.alloc(4);
        end.writeUInt32BE(0, 0);
        socket.end(end);
      });
    });
  }
}
