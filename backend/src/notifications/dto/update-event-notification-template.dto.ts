import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class UpdateEventNotificationTemplateDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @Length(1, 240)
  subject?: string;

  @IsOptional()
  @IsString()
  @Length(1, 10_000)
  bodyText?: string;
}
