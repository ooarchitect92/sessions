import { describe, expect, it } from 'vitest';
import {
  applyWhiteboardOperation,
  parseOperation,
  parseSnapshot,
} from './whiteboard-reducer';

describe('whiteboard reducer', () => {
  it('upserts, deletes and clears elements deterministically', () => {
    let state = parseSnapshot({ elements: [] });
    state = applyWhiteboardOperation(
      state,
      parseOperation('UPSERT_ELEMENT', {
        element: { id: 'a', type: 'TEXT', x: 10, y: 20, text: 'Hello' },
      }),
    );
    expect(state.elements).toHaveLength(1);

    state = applyWhiteboardOperation(
      state,
      parseOperation('UPSERT_ELEMENT', {
        element: { id: 'a', type: 'TEXT', x: 30, y: 40, text: 'Updated' },
      }),
    );
    expect(state.elements[0]?.text).toBe('Updated');

    state = applyWhiteboardOperation(
      state,
      parseOperation('DELETE_ELEMENT', { elementId: 'a' }),
    );
    expect(state.elements).toHaveLength(0);

    state = applyWhiteboardOperation(
      {
        elements: [{ id: 'b', type: 'RECT', x: 0, y: 0, width: 20, height: 20 }],
      },
      parseOperation('CLEAR', {}),
    );
    expect(state.elements).toEqual([]);
  });

  it('rejects oversized whiteboard payloads', () => {
    expect(() =>
      parseOperation('UPSERT_ELEMENT', {
        element: {
          id: 'pen',
          type: 'PEN',
          x: 0,
          y: 0,
          points: Array.from({ length: 3001 }, (_, index) => ({ x: index, y: 0 })),
        },
      }),
    ).toThrow();
  });
});
