import { AgendaItemType } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AgendaDraftItemDto {
  @IsString()
  @Length(1, 160)
  title!: string;

  @IsInt()
  @Min(30)
  @Max(86400)
  durationSeconds!: number;

  @IsEnum(AgendaItemType)
  type!: AgendaItemType;

  @IsOptional()
  @IsObject()
  content: Record<string, unknown> = {};
}

export class ApplyAgendaDraftDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AgendaDraftItemDto)
  items!: AgendaDraftItemDto[];
}
