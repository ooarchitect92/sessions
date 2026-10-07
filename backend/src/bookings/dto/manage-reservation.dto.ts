import { IsString, Length } from 'class-validator';

export class ManageReservationDto {
  @IsString()
  @Length(64, 64)
  managementToken!: string;
}
