import { IsString, Length } from 'class-validator';

export class BroadcastBreakoutMessageDto {
  @IsString()
  @Length(1, 1000)
  message!: string;
}
