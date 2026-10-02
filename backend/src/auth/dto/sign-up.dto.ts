import { IsEmail, IsString, Length, Matches } from 'class-validator';

const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class SignUpDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(2, 160)
  displayName!: string;

  @IsString()
  @Length(12, 128)
  @Matches(STRONG_PASSWORD, {
    message: 'password must include upper, lower, number, and symbol characters',
  })
  password!: string;

  @IsString()
  @Length(2, 160)
  organizationName!: string;

  @IsString()
  @Length(2, 100)
  @Matches(SLUG)
  organizationSlug!: string;

  @IsString()
  @Length(2, 160)
  workspaceName!: string;

  @IsString()
  @Length(2, 100)
  @Matches(SLUG)
  workspaceSlug!: string;

  @IsString()
  @Length(1, 100)
  timezone!: string;
}
