import { IsBoolean } from 'class-validator';

export class UpdateHandRaiseDto {
  @IsBoolean()
  raised!: boolean;
}
