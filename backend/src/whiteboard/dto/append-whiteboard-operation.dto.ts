import { WhiteboardOperationKind } from '@prisma/client';
import { IsEnum, IsObject, IsUUID } from 'class-validator';

export class AppendWhiteboardOperationDto {
  @IsUUID('4')
  operationId!: string;

  @IsEnum(WhiteboardOperationKind)
  kind!: WhiteboardOperationKind;

  @IsObject()
  payload!: Record<string, unknown>;
}
