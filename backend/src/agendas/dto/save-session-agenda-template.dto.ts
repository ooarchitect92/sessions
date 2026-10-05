import { IsOptional, IsString, Length } from 'class-validator';

export class SaveSessionAgendaTemplateDto {
  @IsString()
  @Length(1, 160)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;
}
