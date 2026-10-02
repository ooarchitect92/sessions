import { PollType } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsString,
  Length,
} from 'class-validator';

export class CreatePollDto {
  @IsString()
  @Length(1, 1000)
  question!: string;

  @IsEnum(PollType)
  type!: PollType;

  @IsBoolean()
  anonymous = false;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  options: string[] = [];
}
