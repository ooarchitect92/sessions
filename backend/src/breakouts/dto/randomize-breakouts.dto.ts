import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class RandomizeBreakoutsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  userIds!: string[];
}
