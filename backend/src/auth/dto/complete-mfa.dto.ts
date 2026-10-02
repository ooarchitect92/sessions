import { IsString, Length, Matches } from 'class-validator';

export class CompleteMfaDto {
  @IsString()
  @Length(20, 2000)
  challengeToken!: string;

  @IsString()
  @Length(6, 32)
  @Matches(/^(?:\d{6}|[a-f0-9]{6}-[a-f0-9]{6})$/i)
  code!: string;
}
