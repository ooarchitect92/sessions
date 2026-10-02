import { EgressStatus } from 'livekit-server-sdk';
import { describe, expect, it } from 'vitest';
import { classifyEgressStatus } from './recording-egress-state';

describe('classifyEgressStatus', () => {
  it('maps terminal provider states', () => {
    expect(classifyEgressStatus(EgressStatus.EGRESS_COMPLETE)).toBe('COMPLETE');
    expect(classifyEgressStatus(EgressStatus.EGRESS_FAILED)).toBe('FAILED');
    expect(classifyEgressStatus(EgressStatus.EGRESS_ABORTED)).toBe('FAILED');
    expect(classifyEgressStatus(EgressStatus.EGRESS_LIMIT_REACHED)).toBe('FAILED');
  });

  it('keeps active and transitional jobs non-terminal', () => {
    expect(classifyEgressStatus(EgressStatus.EGRESS_STARTING)).toBe('STARTING');
    expect(classifyEgressStatus(EgressStatus.EGRESS_ACTIVE)).toBe('ACTIVE');
    expect(classifyEgressStatus(EgressStatus.EGRESS_ENDING)).toBe('ACTIVE');
  });
});
