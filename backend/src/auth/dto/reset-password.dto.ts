import { IsString, Length, Matches } from 'class-validator';

const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

export class ResetPasswordDto {
  @IsString()
  @Length(20, 500)
  token!: string;

  @IsString()
  @Length(12, 128)
  @Matches(STRONG_PASSWORD, {
    message: 'password must include upper, lower, number, and symbol characters',
  })
  password!: string;
}
