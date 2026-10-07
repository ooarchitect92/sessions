import { IsString, IsUUID, Length } from 'class-validator';

export class AdmitWebinarAttendeeDto {
  @IsUUID('4')
  registrationId!: string;

  @IsString()
  @Length(20, 512)
  admissionToken!: string;
}
