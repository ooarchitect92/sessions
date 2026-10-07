import { IsOptional, IsString, Length } from 'class-validator';

export class GenerateAgendaDraftDto {
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  prompt?: string;
}
