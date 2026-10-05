import {
  ArrayMaxSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class UpdateMemorySummaryDto {
  @IsString()
  @Length(1, 20000)
  summaryText!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsObject({ each: true })
  decisions?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsObject({ each: true })
  actionItems?: Record<string, unknown>[];
}
