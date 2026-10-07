import { IsString, IsUrl, Length } from 'class-validator';

export class CalendarOAuthCallbackDto {
  @IsString()
  @Length(1, 4096)
  code!: string;

  @IsString()
  @Length(32, 256)
  state!: string;

  @IsUrl({ require_protocol: true })
  redirectUri!: string;
}
