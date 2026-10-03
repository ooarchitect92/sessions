import { IsBoolean } from 'class-validator';

export class MuteParticipantTrackDto {
  @IsBoolean()
  muted!: boolean;
}
