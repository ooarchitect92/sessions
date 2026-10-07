import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  ValidateNested,
} from 'class-validator';
import { CreateAgendaItemDto } from './create-agenda-item.dto';

export class ApplyAgendaDraftDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CreateAgendaItemDto)
  items!: CreateAgendaItemDto[];

  @IsIn(['APPEND', 'REPLACE'])
  mode: 'APPEND' | 'REPLACE' = 'APPEND';
}
