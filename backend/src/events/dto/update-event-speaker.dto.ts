import { EventStageRole } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
} from 'class-validator';

export class UpdateEventSpeakerDto {
  @IsOptional()
  @IsUUID('4')
  userId?: string | null;

  @IsOptional()
  @IsEnum(EventStageRole)
  role?: EventStageRole;

  @IsOptional()
  @IsString()
  @Length(1, 160)
  displayName?: string;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 160)
  title?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 4000)
  bio?: string | null;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  avatarUrl?: string | null;
}
