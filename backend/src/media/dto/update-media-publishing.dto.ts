import { IsBoolean } from 'class-validator';

export class UpdateMediaPublishingDto {
  @IsBoolean()
  canPublish!: boolean;
}
