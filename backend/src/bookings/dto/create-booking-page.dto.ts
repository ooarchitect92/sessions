import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class AvailabilityRuleDto {
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;
}

export class CreateBookingPageDto {
  @IsString()
  @Length(2, 100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @IsString()
  @Length(1, 160)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 5000)
  description?: string;

  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes!: number;

  @IsString()
  @Length(1, 100)
  timezone!: string;

  @IsInt()
  @Min(0)
  @Max(525_600)
  minimumNoticeMinutes = 60;

  @IsInt()
  @Min(0)
  @Max(1440)
  bufferBeforeMinutes = 0;

  @IsInt()
  @Min(0)
  @Max(1440)
  bufferAfterMinutes = 0;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(28)
  @ValidateNested({ each: true })
  @Type(() => AvailabilityRuleDto)
  availabilityRules!: AvailabilityRuleDto[];

  @IsArray()
  @ArrayMaxSize(50)
  @IsObject({ each: true })
  intakeFields: Record<string, unknown>[] = [];
}
