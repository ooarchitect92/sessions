import { IsBoolean } from 'class-validator';

export class UpdateParticipantPermissionsDto {
  @IsBoolean()
  canPublish!: boolean;
}
