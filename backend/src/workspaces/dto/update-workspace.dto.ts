import {
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class UpdateWorkspaceDto {
  @IsOptional()
  @IsString()
  @Length(2, 160)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  timezone?: string;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}
