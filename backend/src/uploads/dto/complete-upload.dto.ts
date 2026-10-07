import { IsOptional, Matches } from 'class-validator';

export class CompleteUploadDto {
  @IsOptional()
  @Matches(/^[a-fA-F0-9]{64}$/)
  checksumSha256?: string;
}
