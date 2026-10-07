import { IsString, Length } from 'class-validator';

export class BroadcastBreakoutDto {
  @IsString()
  @Length(1, 1000)
  message!: string;
}
