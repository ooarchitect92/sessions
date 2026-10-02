import { QuestionStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';

export class ModerateQuestionDto {
  @IsEnum(QuestionStatus)
  status!: QuestionStatus;

  @IsOptional()
  @IsString()
  @Length(1, 10_000)
  answerText?: string;
}
