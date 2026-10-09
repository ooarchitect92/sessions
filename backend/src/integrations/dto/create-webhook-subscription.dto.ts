import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  IsUrl,
  Length,
} from 'class-validator';

export class CreateWebhookSubscriptionDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsUrl({ require_protocol: true })
  @Length(1, 2048)
  url!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  eventTypes!: string[];
}
