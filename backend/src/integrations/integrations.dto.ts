import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const API_KEY_SCOPES = [
  'sessions:read',
  'sessions:write',
  'rooms:read',
  'rooms:write',
  'events:read',
  'events:write',
  'bookings:read',
  'bookings:write',
  'memory:read',
  'analytics:read',
] as const;

export class CreateApiKeyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsIn(API_KEY_SCOPES, { each: true })
  scopes!: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  expiresInDays?: number;
}

export class CreateWebhookSubscriptionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  endpointUrl!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  eventTypes!: string[];
}