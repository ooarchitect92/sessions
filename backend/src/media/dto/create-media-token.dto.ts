import { IsOptional, IsUUID } from 'class-validator';

export class CreateMediaTokenDto {
  @IsOptional()
  @IsUUID('4')
  breakoutRoomId?: string;
}
