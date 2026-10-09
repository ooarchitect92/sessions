import { IsOptional, IsString, Length } from 'class-validator';

export class CreateAgendaTemplateFromSessionDto {
  @IsString()
  @Length(1, 160)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;
}
