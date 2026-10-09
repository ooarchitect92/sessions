import { IsIn } from 'class-validator';

export class ApplyAgendaTemplateDto {
  @IsIn(['APPEND', 'REPLACE'])
  mode: 'APPEND' | 'REPLACE' = 'REPLACE';
}
