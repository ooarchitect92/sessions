import { IsIn, IsObject, IsUUID } from 'class-validator';

export class ApplyWhiteboardOperationDto {
  @IsUUID('4')
  operationId!: string;

  @IsIn(['UPSERT_ELEMENT', 'DELETE_ELEMENT', 'CLEAR'])
  type!: 'UPSERT_ELEMENT' | 'DELETE_ELEMENT' | 'CLEAR';

  @IsObject()
  payload!: Record<string, unknown>;
}
