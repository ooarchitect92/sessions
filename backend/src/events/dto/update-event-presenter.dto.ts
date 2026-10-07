import { EventPresenterRole } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  Min,
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
  @IsEmail()
  @Length(3, 320)
  email?: string;

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
  @Length(0, 2000)
  avatarUrl?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  position?: number;
}
