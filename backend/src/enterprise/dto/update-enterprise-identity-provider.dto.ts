import { WorkspaceRole } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateEnterpriseIdentityProviderDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedDomains?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  emailClaim?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nameClaim?: string;

  @IsOptional()
  @IsEnum(WorkspaceRole)
  defaultRole?: WorkspaceRole;

  @IsOptional()
  @IsBoolean()
  enforceSso?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
