import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class UpdateAiExternalActionDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  recipientEmail?: string;

  @IsOptional()
  @IsString()
  @Length(1, 240)
  subject?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20000)
  bodyText?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  targetProvider?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  targetRecordId?: string;
}
