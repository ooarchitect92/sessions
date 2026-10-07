import { IsString, Length } from 'class-validator';

export class CreateBreakoutRoomDto {
  @IsString()
  @Length(1, 160)
  name!: string;
}
