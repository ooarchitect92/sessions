import { IsBoolean, IsOptional } from 'class-validator';

export class RandomizeBreakoutAssignmentsDto {
  @IsOptional()
  @IsBoolean()
  includeHosts = false;
}
