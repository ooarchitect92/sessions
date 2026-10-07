import { IsString, Length, Matches } from 'class-validator';

export class ResolveEmbedDto {
  @IsString()
  @Length(1, 2048)
  @Matches(/^https:\/\//i, {
    message: 'Embed URL must use HTTPS',
  })
  url!: string;
}
