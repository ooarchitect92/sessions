import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateTranscriptSegmentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  speakerLabel?: string | null;
}
