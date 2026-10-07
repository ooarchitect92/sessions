import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SummaryDecisionDto {
  @IsString()
  @Length(1, 2000)
  text!: string;
}

export class SummaryActionItemDto {
  @IsString()
  @Length(1, 2000)
  text!: string;

  @IsOptional()
  @IsString()
  @Length(1, 160)
  owner?: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;
}

export class SummaryCitationDto {
  @IsString()
  @Length(1, 4000)
  quote!: string;

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
}

export class UpdateMemorySummaryDto {
  @IsOptional()
  @IsString()
  @Length(1, 20_000)
  summaryText?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SummaryDecisionDto)
  decisions?: SummaryDecisionDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SummaryActionItemDto)
  actionItems?: SummaryActionItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SummaryCitationDto)
  citations?: SummaryCitationDto[];
}
