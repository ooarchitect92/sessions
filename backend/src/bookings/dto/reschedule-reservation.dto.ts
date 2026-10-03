import { IsISO8601, IsString, Length } from '@nestjs/class-validator';

export class RescheduleReservationDto {
  @IsString()
  @Length(32, 200)
  managementToken!: string;

  @IsISO8601()
  startsAt!: string;

  @IsString()
  @Length(1, 100)
  timezone!: string;
}
