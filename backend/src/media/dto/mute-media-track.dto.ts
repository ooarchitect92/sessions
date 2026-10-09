import { IsBoolean } from 'class-validator';

export class MuteMediaTrackDto {
  @IsBoolean()
  muted!: boolean;
}
