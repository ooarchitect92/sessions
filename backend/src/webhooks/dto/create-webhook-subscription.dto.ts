import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
} from 'class-validator';

export class CreateWebhookSubscriptionDto {
  @IsUrl({
    protocols: ['https'],
    require_protocol: true,
    require_tld: false,
  })
  @Length(1, 2048)
  url!: string;

  @IsOptional()
  @IsString()
  @Length(0, 160)
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Matches(/^(?:\*|[a-z0-9]+(?:[._-][a-z0-9]+)*)$/, { each: true })
  eventTypes!: string[];
}
