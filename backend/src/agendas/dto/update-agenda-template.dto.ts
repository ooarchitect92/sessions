import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateAgendaItemDto } from './create-agenda-item.dto';

export class UpdateAgendaTemplateDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsOptional()
  @IsString()
  @Length(1, 160)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CreateAgendaItemDto)
  items?: CreateAgendaItemDto[];
}
