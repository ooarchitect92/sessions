import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCustomDomainDto {
  @IsString()
  @MinLength(4)
  @MaxLength(253)
  hostname!: string;
}