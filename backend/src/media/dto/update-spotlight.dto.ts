import { IsBoolean } from 'class-validator';

export class UpdateSpotlightDto {
  @IsBoolean()
  spotlighted!: boolean;
}
