import {
  EnterpriseIdentityProviderKind,
  WorkspaceRole,
} from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateEnterpriseIdentityProviderDto {
  @IsEnum(EnterpriseIdentityProviderKind)
  kind!: EnterpriseIdentityProviderKind;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  issuer?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  clientId?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(4096)
  clientSecret?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @IsArray()
  @IsString({ each: true })
  allowedDomains!: string[];

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
