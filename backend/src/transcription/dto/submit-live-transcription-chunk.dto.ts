import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SubmitLiveTranscriptionChunkDto {
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  sequence!: number;

  @IsInt()
  @Min(0)
  @Max(86_400_000)
  startMs!: number;

  @IsString()
  @Length(1, 160)
  mimeType!: string;

  @IsOptional()
  @IsString()
  @Length(2, 32)
  language?: string;

  @IsString()
  @MaxLength(3_000_000)
  @Matches(/^[A-Za-z0-9+/]*={0,2}$/)
  audioBase64!: string;
}
