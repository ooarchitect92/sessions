import { describe, expect, it } from 'vitest';
import { parseClamAvResponse } from './clamav-scanner.service';

describe('parseClamAvResponse', () => {
  it('accepts a clean stream response', () => {
    expect(parseClamAvResponse('stream: OK\n')).toEqual({
      clean: true,
      signature: null,
      raw: 'stream: OK',
    });
  });

  it('extracts the malware signature', () => {
    expect(
      parseClamAvResponse('stream: Win.Test.EICAR_HDB-1 FOUND\n'),
    ).toEqual({
      clean: false,
      signature: 'Win.Test.EICAR_HDB-1',
      raw: 'stream: Win.Test.EICAR_HDB-1 FOUND',
    });
  });

  it('rejects unknown scanner responses', () => {
    expect(() => parseClamAvResponse('stream: ERROR')).toThrow(
      'Unexpected ClamAV response',
    );
  });
});
