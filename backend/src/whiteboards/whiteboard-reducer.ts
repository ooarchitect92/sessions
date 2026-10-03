import { z } from 'zod';

const pointSchema = z.object({
  x: z.number().finite().min(-100000).max(100000),
  y: z.number().finite().min(-100000).max(100000),
});

const elementSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(['PEN', 'RECT', 'TEXT', 'STICKY']),
  x: z.number().finite().min(-100000).max(100000),
  y: z.number().finite().min(-100000).max(100000),
  width: z.number().finite().min(0).max(100000).optional(),
  height: z.number().finite().min(0).max(100000).optional(),
  text: z.string().max(5000).optional(),
  points: z.array(pointSchema).max(3000).optional(),
});

const snapshotSchema = z.object({
  elements: z.array(elementSchema).max(5000),
});

export type WhiteboardElement = z.infer<typeof elementSchema>;
export type WhiteboardSnapshot = z.infer<typeof snapshotSchema>;

export type WhiteboardOperationInput =
  | { type: 'UPSERT_ELEMENT'; payload: { element: WhiteboardElement } }
  | { type: 'DELETE_ELEMENT'; payload: { elementId: string } }
  | { type: 'CLEAR'; payload: Record<string, never> };

export function parseSnapshot(value: unknown): WhiteboardSnapshot {
  const parsed = snapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : { elements: [] };
}

export function parseOperation(
  type: 'UPSERT_ELEMENT' | 'DELETE_ELEMENT' | 'CLEAR',
  payload: unknown,
): WhiteboardOperationInput {
  if (type === 'UPSERT_ELEMENT') {
    return {
      type,
      payload: z.object({ element: elementSchema }).parse(payload),
    };
  }
  if (type === 'DELETE_ELEMENT') {
    return {
      type,
      payload: z.object({ elementId: z.string().min(1).max(100) }).parse(payload),
    };
  }
  return {
    type,
    payload: z.object({}).strict().parse(payload),
  };
}

export function applyWhiteboardOperation(
  snapshot: WhiteboardSnapshot,
  operation: WhiteboardOperationInput,
): WhiteboardSnapshot {
  if (operation.type === 'CLEAR') return { elements: [] };

  if (operation.type === 'DELETE_ELEMENT') {
    return {
      elements: snapshot.elements.filter(
        (element) => element.id !== operation.payload.elementId,
      ),
    };
  }

  const next = [...snapshot.elements];
  const index = next.findIndex(
    (element) => element.id === operation.payload.element.id,
  );
  if (index >= 0) {
    next[index] = operation.payload.element;
  } else {
    next.push(operation.payload.element);
  }
  return { elements: next };
}
