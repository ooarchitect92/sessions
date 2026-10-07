import { IsIn, IsObject, IsUUID } from 'class-validator';

export const WHITEBOARD_OPERATION_KINDS = [
  'STROKE_ADD',
  'SHAPE_ADD',
  'NOTE_ADD',
  'TEXT_ADD',
  'OBJECT_REMOVE',
  'CLEAR',
] as const;

export type WhiteboardOperationKind =
  (typeof WHITEBOARD_OPERATION_KINDS)[number];

export class AppendWhiteboardOperationDto {
  @IsUUID('4')
  clientOperationId!: string;

  @IsIn(WHITEBOARD_OPERATION_KINDS)
  kind!: WhiteboardOperationKind;

  @IsObject()
  payload!: Record<string, unknown>;
}
