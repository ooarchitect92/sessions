import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
} from 'class-validator';
import { WorkspaceRole } from '@prisma/client';

export class CreateApiKeyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsEnum(WorkspaceRole)
  role!: WorkspaceRole;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Matches(/^[a-z0-9_.:-]{2,160}$/i, { each: true })
  scopes!: string[];

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
