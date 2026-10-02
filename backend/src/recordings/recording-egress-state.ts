import { EgressStatus } from 'livekit-server-sdk';

export type RecordingEgressState = 'STARTING' | 'ACTIVE' | 'COMPLETE' | 'FAILED';

export function classifyEgressStatus(status: EgressStatus): RecordingEgressState {
  switch (status) {
    case EgressStatus.EGRESS_COMPLETE:
      return 'COMPLETE';
    case EgressStatus.EGRESS_FAILED:
    case EgressStatus.EGRESS_ABORTED:
    case EgressStatus.EGRESS_LIMIT_REACHED:
      return 'FAILED';
    case EgressStatus.EGRESS_ACTIVE:
    case EgressStatus.EGRESS_ENDING:
      return 'ACTIVE';
    default:
      return 'STARTING';
  }
}
