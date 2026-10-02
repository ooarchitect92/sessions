import { IsEmail, IsObject, IsString, Length } from 'class-validator';

export class RegisterEventDto {
  @IsString()
  @Length(1, 160)
  name!: string;

  @IsEmail()
  email!: string;

  @IsObject()
  answers: Record<string, unknown> = {};
}
