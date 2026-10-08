import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateCrmNoteDto {
  @IsString()
  @Length(1, 80)
  targetProvider!: string;

  @IsString()
  @Length(1, 255)
  targetRecordId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  guidance?: string;
}
