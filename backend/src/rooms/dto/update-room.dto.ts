import { IsObject, IsOptional, IsString, Length, Matches } from 'class-validator';

export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  @Length(1, 160)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must contain lowercase letters, numbers, and single hyphens',
  })
  slug?: string;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}
