import { describe, expect, it } from 'vitest';
import { distributeParticipants } from './breakout-distribution';

describe('distributeParticipants', () => {
  it('distributes participants across rooms as evenly as possible', () => {
    const result = distributeParticipants(
      ['u1', 'u2', 'u3', 'u4', 'u5'],
      ['r1', 'r2'],
    );
    expect(result.get('r1')).toEqual(['u1', 'u3', 'u5']);
    expect(result.get('r2')).toEqual(['u2', 'u4']);
  });
});
