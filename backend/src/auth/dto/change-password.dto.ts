import { IsString, Length, Matches } from 'class-validator';

const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

export class ChangePasswordDto {
  @IsString()
  @Length(1, 128)
  currentPassword!: string;

  @IsString()
  @Length(12, 128)
  @Matches(STRONG_PASSWORD, {
    message: 'newPassword must include upper, lower, number, and symbol characters',
  })
  newPassword!: string;
}
