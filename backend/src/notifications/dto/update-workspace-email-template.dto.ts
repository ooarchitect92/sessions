import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class UpdateWorkspaceEmailTemplateDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @Length(1, 240)
  subject?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20000)
  bodyText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  signatureText?: string;
}
