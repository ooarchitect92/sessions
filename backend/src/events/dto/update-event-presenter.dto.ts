import { EventPresenterRole } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  Length,
} from 'class-validator';

export class UpdateEventPresenterDto {
  @IsOptional()
  @IsEnum(EventPresenterRole)
  role?: EventPresenterRole;

  @IsOptional()
  @IsString()
  @Length(1, 160)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 160)
  title?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 3000)
  bio?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  avatarUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
