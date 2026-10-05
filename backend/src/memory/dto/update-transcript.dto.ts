import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateTranscriptSegmentDto {
  @IsInt()
  @Min(0)
  position!: number;

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
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20_000)
  @ValidateNested({ each: true })
  @Type(() => UpdateTranscriptSegmentDto)
  segments!: UpdateTranscriptSegmentDto[];

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  reason?: string;
}
