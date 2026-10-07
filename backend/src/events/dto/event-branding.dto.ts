import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsHexColor,
  IsIn,
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
  @IsHexColor()
  primaryColor?: string;

  @IsOptional()
  @IsHexColor()
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
  @IsIn(EVENT_LANDING_SECTIONS, { each: true })
  sectionOrder?: EventLandingSection[];
}
