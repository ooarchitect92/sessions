import { IsOptional, IsString, Length } from 'class-validator';

export class CancelReservationDto {
  @IsString()
  @Length(64, 64)
  managementToken!: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  reason?: string;
}
