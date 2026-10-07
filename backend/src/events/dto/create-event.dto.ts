import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsObject,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { PublicFormFieldDto } from '../../common/forms/public-form-field.dto';

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
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PublicFormFieldDto)
  registrationFields: PublicFormFieldDto[] = [];

  @IsObject()
  branding: Record<string, unknown> = {};
}
