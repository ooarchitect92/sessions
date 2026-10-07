import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

export const MARKETING_LEAD_KINDS = ['DEMO', 'CONTACT', 'NEWSLETTER'] as const;
export type MarketingLeadKind = (typeof MARKETING_LEAD_KINDS)[number];

export class CreateMarketingLeadDto {
  @IsUUID('4')
  submissionKey!: string;

  @IsIn(MARKETING_LEAD_KINDS)
  kind!: MarketingLeadKind;

  @IsOptional()
  @IsString()
  @Length(1, 160)
  name?: string;

  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsOptional()
  @IsString()
  @Length(1, 160)
  company?: string;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  teamSize?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourcePath?: string;

  @IsBoolean()
  consent!: boolean;

  @IsOptional()
  @IsObject()
  metadata: Record<string, unknown> = {};

  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}
