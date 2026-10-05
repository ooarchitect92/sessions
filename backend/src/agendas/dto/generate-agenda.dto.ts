import { IsInt, IsString, Length, Max, Min } from 'class-validator';

export class GenerateAgendaDto {
  @IsString()
  @Length(3, 2000)
  objective!: string;

  @IsInt()
  @Min(2)
  @Max(12)
  desiredItems: number = 5;
}
