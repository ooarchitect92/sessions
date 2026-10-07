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

export class CreateEventPresenterDto {
  @IsEnum(EventPresenterRole)
  role!: EventPresenterRole;

  @IsString()
  @Length(1, 160)
  name!: string;

  @IsEmail()
  @Length(3, 320)
  email!: string;

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
  @Length(0, 2000)
  avatarUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  position?: number;
}
