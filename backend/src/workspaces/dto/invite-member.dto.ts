import { WorkspaceRole } from '@prisma/client';
import { IsEmail, IsEnum } from 'class-validator';

export class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsEnum(WorkspaceRole)
  role: WorkspaceRole = WorkspaceRole.MEMBER;
}
