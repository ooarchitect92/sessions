import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class SaveAgendaTemplateDto {
  @IsString()
  @Length(1, 160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
