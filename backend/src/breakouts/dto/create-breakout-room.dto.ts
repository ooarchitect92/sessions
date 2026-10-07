import { IsInt, IsString, Length, Max, Min } from 'class-validator';

export class CreateBreakoutRoomDto {
  @IsString()
  @Length(1, 160)
  name!: string;

  @IsInt()
  @Min(0)
  @Max(999)
  position!: number;
}
