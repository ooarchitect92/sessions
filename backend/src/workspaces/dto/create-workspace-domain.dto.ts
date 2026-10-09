import { IsFQDN, IsString, Length } from 'class-validator';

export class CreateWorkspaceDomainDto {
  @IsString()
  @Length(3, 253)
  @IsFQDN({
    require_tld: true,
    allow_underscores: false,
    allow_trailing_dot: false,
  })
  hostname!: string;
}
