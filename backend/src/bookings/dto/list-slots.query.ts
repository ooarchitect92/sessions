import { IsDateString } from 'class-validator';

export class ListSlotsQuery {
  @IsDateString()
  dateFrom!: string;

  @IsDateString()
  dateTo!: string;
}
