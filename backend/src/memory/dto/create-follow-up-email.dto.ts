import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateFollowUpEmailDto {
  @IsEmail()
  @MaxLength(320)
  recipientEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  guidance?: string;
}
