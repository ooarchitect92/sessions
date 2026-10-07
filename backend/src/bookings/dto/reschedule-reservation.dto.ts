import { IsDateString, IsString, Length } from 'class-validator';

export class RescheduleReservationDto {
  @IsString()
  @Length(64, 64)
  managementToken!: string;

  @IsDateString()
  startsAt!: string;

  @IsString()
  @Length(1, 100)
  timezone!: string;
}
