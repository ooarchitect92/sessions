import { IsInt, IsString, Length, Max, Min } from 'class-validator';

export class CreateFileUploadDto {
  @IsString()
  @Length(1, 255)
  filename!: string;

  @IsString()
  @Length(1, 160)
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(52_428_800)
  sizeBytes!: number;
}
