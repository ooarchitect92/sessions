import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { CreateAgendaItemDto } from './create-agenda-item.dto';

export class CreateAgendaTemplateDto {
  @IsString()
  @Length(1, 160)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CreateAgendaItemDto)
  items!: CreateAgendaItemDto[];
}
