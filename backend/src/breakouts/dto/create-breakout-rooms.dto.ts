import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, Length, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class BreakoutRoomInputDto {
  @IsString()
  @Length(1, 160)
  name!: string;
}

export class CreateBreakoutRoomsDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => BreakoutRoomInputDto)
  rooms!: BreakoutRoomInputDto[];
}
