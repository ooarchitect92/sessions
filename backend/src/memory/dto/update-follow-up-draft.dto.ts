import { IsString, Length } from 'class-validator';

export class UpdateFollowUpDraftDto {
  @IsString()
  @Length(1, 300)
  subject!: string;

  @IsString()
  @Length(1, 20000)
  body!: string;
}
