import { IsString, Length } from 'class-validator';

export class BroadcastBreakoutDto {
  @IsString()
  @Length(1, 2000)
  body!: string;
}
