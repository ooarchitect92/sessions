import { IsBoolean } from 'class-validator';

export class SetHandRaiseDto {
  @IsBoolean()
  raised!: boolean;
}
