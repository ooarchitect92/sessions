import { IsString, IsUUID, Length } from 'class-validator';

export class SwitchWorkspaceDto {
  @IsUUID('4')
  workspaceId!: string;

  @IsString()
  @Length(20, 500)
  refreshToken!: string;
}
