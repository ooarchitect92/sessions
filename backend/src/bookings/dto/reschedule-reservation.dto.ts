import { IsISO8601, IsString, Length } from 'class-validator';

export class RescheduleReservationDto {
  @IsISO8601()
  startsAt!: string;

  @IsString()
  @Length(1, 100)
  timezone!: string;
}
