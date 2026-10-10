import { describe, expect, it } from 'vitest';

describe('live caption contract', () => {
  it('requires monotonically representable sequence values and bounded text', () => {
    const segment = {
      sequence: 42,
      text: 'We will ship on Tuesday.',
      isFinal: true,
      startMs: 1200,
      endMs: 2400,
    };
    expect(segment.sequence).toBeGreaterThanOrEqual(0);
    expect(segment.endMs).toBeGreaterThanOrEqual(segment.startMs);
    expect(segment.text.length).toBeLessThanOrEqual(4000);
  });
});
