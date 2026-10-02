import { RegistrationStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateRegistrationStatusDto {
  @IsEnum(RegistrationStatus)
  status!: RegistrationStatus;
}
