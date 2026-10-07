import { IsUUID } from 'class-validator';

export class AssignBreakoutDto {
  @IsUUID('4')
  userId!: string;

  @IsUUID('4')
  breakoutRoomId!: string;
}
