import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PointerEvent as ReactPointerEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  api,
  type WhiteboardElementRecord,
} from '../api/client';
import type { WhiteboardCursorEvent } from '../hooks/use-session-realtime';

type Tool = 'PEN' | 'RECT' | 'STICKY' | 'ERASER';

type Point = { x: number; y: number };

export function WhiteboardStage({
  sessionId,
  cursors,
  sendCursor,
}: {
  sessionId: string;
  cursors: WhiteboardCursorEvent[];
  sendCursor: (x: number, y: number, active?: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [tool, setTool] = useState<Tool>('PEN');
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [pointer, setPointer] = useState<Point | null>(null);
  const lastCursorAt = useRef(0);

  const whiteboard = useQuery({
    queryKey: ['whiteboard', sessionId],
    queryFn: () => api.getWhiteboardState(sessionId),
  });

  const apply = useMutation({
    mutationFn: (input: {
      type: 'UPSERT_ELEMENT' | 'DELETE_ELEMENT' | 'CLEAR';
      payload: Record<string, unknown>;
    }) =>
      api.applyWhiteboardOperation(sessionId, {
        operationId: crypto.randomUUID(),
        ...input,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['whiteboard', sessionId] });
    },
  });

  const elements = whiteboard.data?.snapshot.elements ?? [];

  const currentRect = useMemo(() => {
    if (tool !== 'RECT' || !dragStart || !pointer) return null;
    return {
      x: Math.min(dragStart.x, pointer.x),
      y: Math.min(dragStart.y, pointer.y),
      width: Math.abs(pointer.x - dragStart.x),
      height: Math.abs(pointer.y - dragStart.y),
    };
  }, [dragStart, pointer, tool]);

  const toCanvasPoint = (event: ReactPointerEvent<SVGSVGElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 1000,
      y: ((event.clientY - rect.top) / rect.height) * 600,
    };
  };

  const broadcastCursor = (point: Point, active = true) => {
    const now = Date.now();
    if (!active || now - lastCursorAt.current >= 50) {
      lastCursorAt.current = now;
      sendCursor(point.x, point.y, active);
    }
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (apply.isPending) return;
    const point = toCanvasPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setPointer(point);
    broadcastCursor(point);

    if (tool === 'PEN') {
      setDraftPoints([point]);
    } else if (tool === 'RECT') {
      setDragStart(point);
    } else if (tool === 'STICKY') {
      const text = window.prompt('Sticky note text');
      if (!text?.trim()) return;
      apply.mutate({
        type: 'UPSERT_ELEMENT',
        payload: {
          element: {
            id: crypto.randomUUID(),
            type: 'STICKY',
            x: point.x,
            y: point.y,
            width: 180,
            height: 100,
            text: text.trim().slice(0, 5000),
          },
        },
      });
    }
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const point = toCanvasPoint(event);
    setPointer(point);
    broadcastCursor(point);
    if (tool === 'PEN' && draftPoints.length > 0) {
      setDraftPoints((current) =>
        current.length >= 3000 ? current : [...current, point],
      );
    }
  };

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const point = toCanvasPoint(event);
    broadcastCursor(point);
    if (tool === 'PEN' && draftPoints.length > 1) {
      apply.mutate({
        type: 'UPSERT_ELEMENT',
        payload: {
          element: {
            id: crypto.randomUUID(),
            type: 'PEN',
            x: draftPoints[0]?.x ?? 0,
            y: draftPoints[0]?.y ?? 0,
            points: draftPoints,
          },
        },
      });
    }
    if (tool === 'RECT' && dragStart) {
      const x = Math.min(dragStart.x, point.x);
      const y = Math.min(dragStart.y, point.y);
      const width = Math.abs(point.x - dragStart.x);
      const height = Math.abs(point.y - dragStart.y);
      if (width > 3 && height > 3) {
        apply.mutate({
          type: 'UPSERT_ELEMENT',
          payload: {
            element: {
              id: crypto.randomUUID(),
              type: 'RECT',
              x,
              y,
              width,
              height,
            },
          },
        });
      }
    }
    setDraftPoints([]);
    setDragStart(null);
  };

  const deleteElement = (element: WhiteboardElementRecord) => {
    if (tool !== 'ERASER' || apply.isPending) return;
    apply.mutate({
      type: 'DELETE_ELEMENT',
      payload: { elementId: element.id },
    });
  };

  return (
    <section className="whiteboard-stage" aria-label="Collaborative whiteboard">
      <div className="whiteboard-toolbar">
        <div>
          <span className="eyebrow">Collaborative whiteboard</span>
          <small>
            {whiteboard.data
              ? `v${whiteboard.data.snapshotVersion} · seq ${whiteboard.data.latestSequence}`
              : 'Loading board…'}
          </small>
        </div>
        <div className="whiteboard-tools" role="toolbar" aria-label="Whiteboard tools">
          {(['PEN', 'RECT', 'STICKY', 'ERASER'] as const).map((candidate) => (
            <button
              type="button"
              key={candidate}
              className={tool === candidate ? 'active' : ''}
              onClick={() => setTool(candidate)}
            >
              {candidate.toLowerCase()}
            </button>
          ))}
          <button
            type="button"
            disabled={apply.isPending || elements.length === 0}
            onClick={() => {
              if (window.confirm('Clear the shared whiteboard for everyone?')) {
                apply.mutate({ type: 'CLEAR', payload: {} });
              }
            }}
          >
            clear
          </button>
        </div>
      </div>

      <div className="whiteboard-canvas-shell">
        <svg
          className="whiteboard-canvas"
          viewBox="0 0 1000 600"
          role="img"
          aria-label="Shared drawing canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => {
            if (pointer) broadcastCursor(pointer, false);
            setPointer(null);
            setDraftPoints([]);
            setDragStart(null);
          }}
        >
          <rect width="1000" height="600" className="whiteboard-background" />

          {elements.map((element) => {
            if (element.type === 'PEN') {
              const points = element.points ?? [];
              return (
                <polyline
                  key={element.id}
                  className={tool === 'ERASER' ? 'whiteboard-erasable' : ''}
                  points={points.map((point) => `${point.x},${point.y}`).join(' ')}
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    deleteElement(element);
                  }}
                />
              );
            }

            if (element.type === 'RECT') {
              return (
                <rect
                  key={element.id}
                  className={tool === 'ERASER' ? 'whiteboard-shape whiteboard-erasable' : 'whiteboard-shape'}
                  x={element.x}
                  y={element.y}
                  width={element.width ?? 0}
                  height={element.height ?? 0}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    deleteElement(element);
                  }}
                />
              );
            }

            return (
              <g
                key={element.id}
                className={tool === 'ERASER' ? 'whiteboard-erasable' : ''}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  deleteElement(element);
                }}
              >
                <rect
                  className="whiteboard-sticky"
                  x={element.x}
                  y={element.y}
                  width={element.width ?? 180}
                  height={element.height ?? 100}
                  rx="8"
                />
                <text
                  className="whiteboard-sticky-text"
                  x={element.x + 12}
                  y={element.y + 26}
                >
                  {(element.text ?? '').slice(0, 42)}
                </text>
              </g>
            );
          })}

          {draftPoints.length > 1 ? (
            <polyline
              className="whiteboard-draft"
              points={draftPoints
                .map((draftPoint) => `${draftPoint.x},${draftPoint.y}`)
                .join(' ')}
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}

          {currentRect ? (
            <rect className="whiteboard-draft-rect" {...currentRect} />
          ) : null}

          {cursors.map((cursor) => (
            <g
              key={cursor.userId}
              transform={`translate(${cursor.x} ${cursor.y})`}
              className="whiteboard-remote-cursor"
            >
              <path d="M0 0 L0 22 L6 16 L11 27 L15 25 L10 14 L19 14 Z" />
              <text x="20" y="14">
                {cursor.displayName}
              </text>
            </g>
          ))}
        </svg>

        {whiteboard.isLoading ? (
          <div className="whiteboard-loading">Loading whiteboard…</div>
        ) : null}
      </div>

      {whiteboard.error || apply.error ? (
        <div className="error-banner compact-error">
          {(whiteboard.error ?? apply.error)?.message}
        </div>
      ) : null}
    </section>
  );
}
