import { IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(1, 128)
  password!: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  workspaceSlug?: string;
}
