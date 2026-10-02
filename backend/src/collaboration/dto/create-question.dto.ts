import { IsBoolean, IsString, Length } from 'class-validator';

export class CreateQuestionDto {
  @IsString()
  @Length(1, 5000)
  body!: string;

  @IsBoolean()
  isAnonymous = false;
}
