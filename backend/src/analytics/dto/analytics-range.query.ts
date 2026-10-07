import { IsISO8601, IsOptional } from 'class-validator';

export class AnalyticsRangeQuery {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
