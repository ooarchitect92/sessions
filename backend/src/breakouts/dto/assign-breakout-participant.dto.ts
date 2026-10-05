import { IsUUID } from 'class-validator';

export class AssignBreakoutParticipantDto {
  @IsUUID('4')
  userId!: string;

  @IsUUID('4')
  breakoutRoomId!: string;
}
