import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class SubmitPollAnswerDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  selectedOptionIds: string[] = [];

  @IsOptional()
  @IsString()
  @Length(0, 5000)
  textAnswer?: string;
}
