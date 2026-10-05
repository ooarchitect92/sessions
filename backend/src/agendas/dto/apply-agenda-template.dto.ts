import { IsBoolean, IsOptional } from 'class-validator';

export class ApplyAgendaTemplateDto {
  @IsOptional()
  @IsBoolean()
  replaceExisting = false;
}
