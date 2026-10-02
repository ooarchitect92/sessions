import { IsISO8601, IsOptional } from 'class-validator';

export class UpdateRecordingRetentionDto {
  @IsOptional()
  @IsISO8601()
  retentionUntil?: string | null;
}
