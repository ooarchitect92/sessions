import { IsString, MinLength } from 'class-validator';

export class OidcCallbackDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  state!: string;
}
