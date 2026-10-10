import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class PublishCaptionDto {
  @IsInt()
  @Min(0)
  @Max(2_000_000_000)
  sequence!: number;

  @IsString()
  @Length(1, 4000)
  text!: string;

  @IsBoolean()
  isFinal!: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86_400_000)
  startMs?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86_400_000)
  endMs?: number;

  @IsOptional()
  @IsString()
  @Length(1, 160)
  speakerLabel?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/)
  language?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  source?: string;
}
