import { IsString, Matches } from 'class-validator';

export class ConfirmMfaDto {
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}
