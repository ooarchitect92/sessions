import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class UpdateAgendaTemplateDto {
  @IsOptional()
  @IsString()
  @Length(1, 160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
