import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class UpdateCalendarConnectionDto {
  @IsOptional()
  @IsBoolean()
  syncEnabled?: boolean;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  calendarId?: string;
}
