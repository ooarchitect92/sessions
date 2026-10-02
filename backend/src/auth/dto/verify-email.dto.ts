import { IsString, Length } from 'class-validator';

export class VerifyEmailDto {
  @IsString()
  @Length(20, 500)
  token!: string;
}
