import { IsOptional, IsString, Length, Matches } from 'class-validator';

const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

export class AcceptInvitationDto {
  @IsString()
  @Length(20, 500)
  token!: string;

  @IsOptional()
  @IsString()
  @Length(2, 160)
  displayName?: string;

  @IsString()
  @Length(12, 128)
  @Matches(STRONG_PASSWORD, {
    message: 'password must include upper, lower, number, and symbol characters',
  })
  password!: string;
}
