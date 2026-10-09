import {
  IsBoolean,
  Matches,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class UpdateBrandingDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  displayName?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  logoUrl?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  faviconUrl?: string;

  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  primaryColor?: string;

  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  accentColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  emailFromName?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  supportUrl?: string;

  @IsOptional()
  @IsBoolean()
  hideSessionsBranding?: boolean;
}
