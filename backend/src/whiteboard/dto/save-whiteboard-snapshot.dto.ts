import { IsInt, IsObject, Min } from 'class-validator';

export class SaveWhiteboardSnapshotDto {
  @IsInt()
  @Min(0)
  baseVersion!: number;

  @IsObject()
  snapshot!: Record<string, unknown>;
}
