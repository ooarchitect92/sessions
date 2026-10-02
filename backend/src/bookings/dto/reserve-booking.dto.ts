import { IsEmail, IsISO8601, IsObject, IsString, Length } from 'class-validator';

export class ReserveBookingDto {
  @IsString()
  @Length(1, 160)
  name!: string;

  @IsEmail()
  email!: string;

  @IsISO8601()
  startsAt!: string;

  @IsString()
  @Length(1, 100)
  timezone!: string;

  @IsObject()
  answers: Record<string, unknown> = {};
}
