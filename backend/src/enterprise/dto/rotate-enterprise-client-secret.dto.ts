import { IsString, MaxLength, MinLength } from 'class-validator';

export class RotateEnterpriseClientSecretDto {
  @IsString()
  @MinLength(8)
  @MaxLength(4096)
  clientSecret!: string;
}
