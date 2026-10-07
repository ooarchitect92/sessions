import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsISO8601,
  ValidateNested,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { DynamicFormFieldDto } from '../../common/forms/dynamic-form';
import { EventBrandingDto } from './event-branding.dto';

export class CreateEventDto {
  @IsString()
  @Length(2, 100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @IsString()
  @Length(1, 160)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 10_000)
  description?: string;

  @IsISO8601()
  startsAt!: string;

  @IsInt()
  @Min(5)
  @Max(1440)
  durationMinutes!: number;

  @IsString()
  @Length(1, 100)
  timezone!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  capacity?: number | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DynamicFormFieldDto)
  registrationFields: DynamicFormFieldDto[] = [];

  @ValidateNested()
  @Type(() => EventBrandingDto)
  branding: EventBrandingDto = {};
}
