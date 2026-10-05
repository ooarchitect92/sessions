import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class GenerateAgendaDraftDto {
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  objective?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  audience?: string;
}
