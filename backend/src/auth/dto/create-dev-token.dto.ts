import { IsArray, IsEmail, IsIn, IsString, IsUUID, Length } from 'class-validator';
import type { WorkspaceRole } from '@prisma/client';

export class CreateDevTokenDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  workspaceId!: string;

  @IsUUID()
  userId!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Length(1, 160)
  displayName = 'Local Owner';

  @IsArray()
  @IsIn(['OWNER', 'ADMIN', 'HOST', 'MEMBER', 'ANALYST', 'GUEST'], { each: true })
  roles: WorkspaceRole[] = ['OWNER'];
}
