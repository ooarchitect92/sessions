import { AgendaItemType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateAgendaItemDto {
  @IsString()
  @Length(1, 160)
  title!: string;

  @IsInt()
  @Min(0)
  @Max(86400)
  durationSeconds!: number;

  @IsEnum(AgendaItemType)
  type!: AgendaItemType;

  @IsOptional()
  @IsObject()
  content: Record<string, unknown> = {};
}
