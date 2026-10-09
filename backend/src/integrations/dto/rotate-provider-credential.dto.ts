import { IsString, MaxLength, MinLength } from 'class-validator';

export class RotateProviderCredentialDto {
  @IsString()
  @MinLength(8)
  @MaxLength(4096)
  secret!: string;
}
