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

export class CreateEventSpeakerDto {
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @IsEnum(EventStageRole)
  role!: EventStageRole;

  @IsString()
  @Length(1, 160)
  displayName!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Length(0, 160)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 4000)
  bio?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  avatarUrl?: string;
}
