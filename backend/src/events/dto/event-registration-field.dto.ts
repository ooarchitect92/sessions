import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export const EVENT_REGISTRATION_FIELD_TYPES = [
  'TEXT',
  'TEXTAREA',
  'EMAIL',
  'SELECT',
  'CHECKBOX',
  'CONSENT',
] as const;

export type EventRegistrationFieldType =
  (typeof EVENT_REGISTRATION_FIELD_TYPES)[number];

export class EventRegistrationFieldDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{0,63}$/)
  key!: string;

  @IsString()
  @Length(1, 160)
  label!: string;

  @IsIn(EVENT_REGISTRATION_FIELD_TYPES)
  type!: EventRegistrationFieldType;

  @IsBoolean()
  required = false;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  placeholder?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  options?: string[];
}
