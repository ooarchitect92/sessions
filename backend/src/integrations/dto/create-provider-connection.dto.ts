import { ProviderConnectionKind } from '@prisma/client';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateProviderConnectionDto {
  @IsEnum(ProviderConnectionKind)
  kind!: ProviderConnectionKind;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsUrl({ protocols: ['https'], require_protocol: true })
  endpointUrl!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(4096)
  secret!: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
