import { UploadPurpose } from '@prisma/client';
import { IsEnum, IsInt, IsMimeType, IsOptional, IsString, IsUUID, Length, Max } from 'class-validator';

export class CreateUploadDto {
  @IsString()
  @Length(1, 255)
  filename!: string;

  @IsMimeType()
  mimeType!: string;

  @IsInt()
  @Max(100 * 1024 * 1024)
  sizeBytes!: number;

  @IsEnum(UploadPurpose)
  purpose!: UploadPurpose;

  @IsOptional()
  @IsUUID('4')
  sessionId?: string;
}
