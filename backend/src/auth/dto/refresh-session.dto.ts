import { IsString, Length } from 'class-validator';

export class RefreshSessionDto {
  @IsString()
  @Length(20, 500)
  refreshToken!: string;
}
