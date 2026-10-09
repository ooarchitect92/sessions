import { IsOptional, IsUUID } from 'class-validator';

export class MediaRoomQueryDto {
  @IsOptional()
  @IsUUID('4')
  breakoutRoomId?: string;
}
