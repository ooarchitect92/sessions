import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  Matches,
  IsOptional,
  IsString,
  IsUrl,
  Length,
} from 'class-validator';

export const EVENT_LANDING_SECTIONS = [
  'ABOUT',
  'PRESENTERS',
  'DETAILS',
] as const;

export type EventLandingSection = (typeof EVENT_LANDING_SECTIONS)[number];

export class EventBrandingDto {
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  primaryColor?: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  accentColor?: string;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  eyebrow?: string;

  @IsOptional()
  @IsString()
  @Length(0, 180)
  heroHeadline?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  heroSubheadline?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  heroImageUrl?: string;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  aboutHeading?: string;

  @IsOptional()
  @IsString()
  @Length(0, 5000)
  aboutBody?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  ctaLabel?: string;

  @IsOptional()
  @IsBoolean()
  showPresenters?: boolean;

  @IsOptional()
  @IsBoolean()
  showEventFacts?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsIn(EVENT_LANDING_SECTIONS, { each: true })
  sectionOrder?: EventLandingSection[];
}
