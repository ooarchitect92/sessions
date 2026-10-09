import {
  IsInt,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class StartCobrowseDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  url!: string;
}

export class NavigateCobrowseDto extends StartCobrowseDto {
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  version!: number;
}

export class GrantCobrowseControlDto {
  @IsUUID('4')
  controllerUserId!: string;

  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  version!: number;
}

export class StopCobrowseDto {
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  version!: number;
}
