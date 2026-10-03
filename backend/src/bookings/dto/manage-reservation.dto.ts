import { IsString, Length } from 'class-validator';

export class ManageReservationDto {
  @IsString()
  @Length(32, 200)
  managementToken!: string;
}

export class ManageReservationQueryDto {
  @IsString()
  @Length(32, 200)
  token!: string;
}
