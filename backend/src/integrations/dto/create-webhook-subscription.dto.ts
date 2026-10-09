import { IsArray, IsBoolean, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class CreateWebhookSubscriptionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsUrl({ protocols: ['https'], require_protocol: true })
  endpointUrl!: string;

  @IsArray()
  @IsString({ each: true })
  eventTypes!: string[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
