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

export const PUBLIC_FORM_FIELD_TYPES = [
  'TEXT',
  'TEXTAREA',
  'SELECT',
  'CHECKBOX',
  'CONSENT',
] as const;

export type PublicFormFieldType = (typeof PUBLIC_FORM_FIELD_TYPES)[number];

export class PublicFormFieldDto {
  @IsString()
  @Length(1, 80)
  @Matches(/^[a-z][a-z0-9_]*$/)
  key!: string;

  @IsString()
  @Length(1, 160)
  label!: string;

  @IsIn(PUBLIC_FORM_FIELD_TYPES)
  type!: PublicFormFieldType;

  @IsBoolean()
  required = false;

  @IsOptional()
  @IsString()
  @Length(0, 240)
  placeholder?: string;

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  options: string[] = [];
}
