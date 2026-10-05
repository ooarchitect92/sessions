import { NotificationKind } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class UpsertNotificationTemplateDto {
  @IsEnum(NotificationKind)
  kind!: NotificationKind;

  @IsString()
  @Length(1, 300)
  subjectTemplate!: string;

  @IsString()
  @Length(1, 20000)
  textTemplate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50000)
  htmlTemplate?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
