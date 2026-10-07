import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class TranscriptSegmentEditDto {
  @IsInt()
  @Min(0)
  @Max(86_400_000)
  startMs!: number;

  @IsInt()
  @Min(0)
  @Max(86_400_000)
  endMs!: number;

  @IsOptional()
  @IsString()
  @Length(1, 160)
  speakerLabel?: string | null;

  @IsString()
  @Length(1, 10_000)
  text!: string;
}

export class UpdateTranscriptDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/, {
    message: 'language must be a valid BCP-47 style language tag',
  })
  language?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => TranscriptSegmentEditDto)
  segments?: TranscriptSegmentEditDto[];

  @IsOptional()
  @IsString()
  @Length(1, 500)
  reason?: string;
}
