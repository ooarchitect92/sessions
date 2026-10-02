import { IsString, Length, Matches } from 'class-validator';

export class DisableMfaDto {
  @IsString()
  @Length(6, 32)
  @Matches(/^(?:\d{6}|[a-f0-9]{6}-[a-f0-9]{6})$/i)
  code!: string;
}
