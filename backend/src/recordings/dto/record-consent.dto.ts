import { RecordingConsentDecision } from '@prisma/client';
import { IsEnum, IsString, Length } from 'class-validator';

export class RecordConsentDto {
  @IsEnum(RecordingConsentDecision)
  decision!: RecordingConsentDecision;

  @IsString()
  @Length(1, 64)
  policyVersion = 'recording-policy-v1';

  @IsString()
  @Length(1, 64)
  noticeVersion = 'recording-notice-v1';
}
