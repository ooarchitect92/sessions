import { WorkspaceRole } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateMemberRoleDto {
  @IsEnum(WorkspaceRole)
  role!: WorkspaceRole;
}
