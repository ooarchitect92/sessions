import { IsUrl } from 'class-validator';

export class StartCalendarOAuthDto {
  @IsUrl({ require_protocol: true })
  redirectUri!: string;
}
