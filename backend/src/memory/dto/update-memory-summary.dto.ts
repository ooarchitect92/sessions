import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateMemoryActionItemDto {
  @IsString()
  @Length(1, 500)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(1, 160)
  owner?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  dueDate?: string | null;
}

export class UpdateMemorySummaryDto {
  @IsString()
  @Length(1, 50_000)
  summaryText!: string;

  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  decisions!: string[];

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => UpdateMemoryActionItemDto)
  actionItems!: UpdateMemoryActionItemDto[];

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  reviewNote?: string;
}
