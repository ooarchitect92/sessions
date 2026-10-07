import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PointerEvent, useMemo, useRef, useState } from 'react';
import {
  api,
  type WhiteboardOperationKind,
  type WhiteboardOperationRecord,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';

type Tool = 'pen' | 'rectangle' | 'text' | 'sticky' | 'image';

type Point = { x: number; y: number };

type BoardObject = {
  id: string;
  kind: WhiteboardOperationKind;
  payload: Record<string, unknown>;
};

function pointList(value: unknown): Point[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (
        item &&
        typeof item === 'object' &&
        typeof (item as { x?: unknown }).x === 'number' &&
        typeof (item as { y?: unknown }).y === 'number'
      ) {
        return {
          x: (item as { x: number }).x,
          y: (item as { y: number }).y,
        };
      }
      return null;
    })
    .filter((item): item is Point => item !== null);
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function boardObjects(
  snapshot: Record<string, unknown> | undefined,
  operations: WhiteboardOperationRecord[] | undefined,
): BoardObject[] {
  const rawSnapshot = snapshot?.objects;
  let objects: BoardObject[] = Array.isArray(rawSnapshot)
    ? rawSnapshot
        .filter(
          (item): item is BoardObject =>
            Boolean(item) &&
            typeof item === 'object' &&
            typeof (item as BoardObject).id === 'string' &&
            typeof (item as BoardObject).kind === 'string' &&
            Boolean((item as BoardObject).payload),
        )
    : [];

  for (const operation of operations ?? []) {
    if (operation.kind === 'CLEAR') {
      objects = [];
      continue;
    }
    objects.push({
      id: operation.operationId,
      kind: operation.kind,
      payload: operation.payload,
    });
  }
  return objects;
}

function relativePoint(
  event: PointerEvent<SVGSVGElement>,
  svg: SVGSVGElement,
): Point {
  const bounds = svg.getBoundingClientRect();
  return {
    x: ((event.clientX - bounds.left) / bounds.width) * 1000,
    y: ((event.clientY - bounds.top) / bounds.height) * 600,
  };
}

export function WhiteboardPanel({ sessionId }: { sessionId: string }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [shapeStart, setShapeStart] = useState<Point | null>(null);
  const [shapeEnd, setShapeEnd] = useState<Point | null>(null);

  const canCompact = (auth.me?.principal.roles ?? []).some((role) =>
    ['OWNER', 'ADMIN', 'HOST'].includes(role),
  );

  const whiteboard = useQuery({
    queryKey: ['whiteboard', sessionId],
    queryFn: () => api.getWhiteboard(sessionId),
  });

  const objects = useMemo(
    () =>
      boardObjects(
        whiteboard.data?.document.snapshot,
        whiteboard.data?.operations,
      ),
    [whiteboard.data],
  );

  const append = useMutation({
    mutationFn: ({
      kind,
      payload,
    }: {
      kind: WhiteboardOperationKind;
      payload: Record<string, unknown>;
    }) =>
      api.appendWhiteboardOperation(sessionId, {
        operationId: crypto.randomUUID(),
        kind,
        payload,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['whiteboard', sessionId] });
    },
  });

  const compact = useMutation({
    mutationFn: () => {
      if (!whiteboard.data) {
        throw new Error('Whiteboard is not loaded');
      }
      return api.saveWhiteboardSnapshot(sessionId, {
        baseVersion: whiteboard.data.document.version,
        snapshot: { objects },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['whiteboard', sessionId] });
    },
  });

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const point = relativePoint(event, svgRef.current);

    if (tool === 'pen') {
      event.currentTarget.setPointerCapture(event.pointerId);
      setDraftPoints([point]);
      return;
    }

    if (tool === 'rectangle') {
      event.currentTarget.setPointerCapture(event.pointerId);
      setShapeStart(point);
      setShapeEnd(point);
      return;
    }

    if (tool === 'text') {
      const text = window.prompt('Text to add to the whiteboard');
      if (text?.trim()) {
        append.mutate({ kind: 'TEXT', payload: { ...point, text: text.trim() } });
      }
      return;
    }

    if (tool === 'sticky') {
      const text = window.prompt('Sticky note text');
      if (text?.trim()) {
        append.mutate({
          kind: 'STICKY',
          payload: { ...point, text: text.trim(), width: 190, height: 120 },
        });
      }
      return;
    }

    const url = window.prompt('HTTPS image URL');
    if (url?.trim()) {
      try {
        const parsed = new URL(url.trim());
        if (parsed.protocol !== 'https:') throw new Error();
        append.mutate({
          kind: 'IMAGE',
          payload: {
            ...point,
            url: parsed.toString(),
            width: 260,
            height: 180,
          },
        });
      } catch {
        window.alert('Please enter a valid HTTPS image URL.');
      }
    }
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const point = relativePoint(event, svgRef.current);
    if (tool === 'pen' && draftPoints.length) {
      setDraftPoints((current) => [...current, point].slice(-1200));
    } else if (tool === 'rectangle' && shapeStart) {
      setShapeEnd(point);
    }
  };

  const handlePointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (tool === 'pen' && draftPoints.length > 1) {
      append.mutate({
        kind: 'STROKE',
        payload: { points: draftPoints, width: 4 },
      });
    } else if (tool === 'rectangle' && shapeStart && shapeEnd) {
      append.mutate({
        kind: 'SHAPE',
        payload: {
          shape: 'rectangle',
          x: Math.min(shapeStart.x, shapeEnd.x),
          y: Math.min(shapeStart.y, shapeEnd.y),
          width: Math.abs(shapeEnd.x - shapeStart.x),
          height: Math.abs(shapeEnd.y - shapeStart.y),
        },
      });
    }
    setDraftPoints([]);
    setShapeStart(null);
    setShapeEnd(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="whiteboard-panel">
      <div className="whiteboard-toolbar">
        <div className="whiteboard-tools" aria-label="Whiteboard tools">
          {(['pen', 'rectangle', 'text', 'sticky', 'image'] as Tool[]).map(
            (value) => (
              <button
                type="button"
                key={value}
                className={tool === value ? 'active' : ''}
                onClick={() => setTool(value)}
              >
                {value}
              </button>
            ),
          )}
        </div>
        <div className="whiteboard-actions">
          <span>
            v{whiteboard.data?.document.version ?? 0}
          </span>
          <button
            type="button"
            disabled={append.isPending}
            onClick={() => append.mutate({ kind: 'CLEAR', payload: {} })}
          >
            Clear
          </button>
          {canCompact ? (
            <button
              type="button"
              disabled={compact.isPending || !whiteboard.data}
              onClick={() => compact.mutate()}
            >
              Compact
            </button>
          ) : null}
        </div>
      </div>

      <div className="whiteboard-canvas-wrap">
        {whiteboard.isLoading ? (
          <div className="whiteboard-loading">Loading whiteboard…</div>
        ) : (
          <svg
            ref={svgRef}
            viewBox="0 0 1000 600"
            className="whiteboard-canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            role="application"
            aria-label="Collaborative whiteboard"
          >
            <rect x="0" y="0" width="1000" height="600" className="whiteboard-bg" />
            <g className="whiteboard-grid">
              {Array.from({ length: 20 }, (_, index) => (
                <line
                  key={`v-${index}`}
                  x1={index * 50}
                  x2={index * 50}
                  y1="0"
                  y2="600"
                />
              ))}
              {Array.from({ length: 12 }, (_, index) => (
                <line
                  key={`h-${index}`}
                  x1="0"
                  x2="1000"
                  y1={index * 50}
                  y2={index * 50}
                />
              ))}
            </g>

            {objects.map((object) => (
              <WhiteboardObjectView object={object} key={object.id} />
            ))}

            {draftPoints.length > 1 ? (
              <polyline
                points={draftPoints.map((point) => `${point.x},${point.y}`).join(' ')}
                className="whiteboard-stroke preview"
              />
            ) : null}

            {shapeStart && shapeEnd ? (
              <rect
                x={Math.min(shapeStart.x, shapeEnd.x)}
                y={Math.min(shapeStart.y, shapeEnd.y)}
                width={Math.abs(shapeEnd.x - shapeStart.x)}
                height={Math.abs(shapeEnd.y - shapeStart.y)}
                className="whiteboard-shape preview"
              />
            ) : null}
          </svg>
        )}
      </div>

      <div className="whiteboard-footer">
        <span>
          {objects.length} objects · realtime operations are persisted per workspace
        </span>
        {append.error ? <strong>{append.error.message}</strong> : null}
        {compact.error ? <strong>{compact.error.message}</strong> : null}
      </div>
    </div>
  );
}

function WhiteboardObjectView({ object }: { object: BoardObject }) {
  if (object.kind === 'STROKE') {
    const points = pointList(object.payload.points);
    return (
      <polyline
        points={points.map((point) => `${point.x},${point.y}`).join(' ')}
        className="whiteboard-stroke"
      />
    );
  }

  if (object.kind === 'SHAPE') {
    return (
      <rect
        x={asNumber(object.payload.x)}
        y={asNumber(object.payload.y)}
        width={asNumber(object.payload.width)}
        height={asNumber(object.payload.height)}
        className="whiteboard-shape"
      />
    );
  }

  if (object.kind === 'TEXT') {
    return (
      <text
        x={asNumber(object.payload.x)}
        y={asNumber(object.payload.y)}
        className="whiteboard-text"
      >
        {asString(object.payload.text)}
      </text>
    );
  }

  if (object.kind === 'STICKY') {
    const x = asNumber(object.payload.x);
    const y = asNumber(object.payload.y);
    const width = asNumber(object.payload.width, 190);
    const height = asNumber(object.payload.height, 120);
    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx="10"
          className="whiteboard-sticky"
        />
        <foreignObject x={x + 12} y={y + 10} width={width - 24} height={height - 20}>
          <div className="whiteboard-sticky-text">{asString(object.payload.text)}</div>
        </foreignObject>
      </g>
    );
  }

  if (object.kind === 'IMAGE') {
    return (
      <image
        href={asString(object.payload.url)}
        x={asNumber(object.payload.x)}
        y={asNumber(object.payload.y)}
        width={asNumber(object.payload.width, 260)}
        height={asNumber(object.payload.height, 180)}
        preserveAspectRatio="xMidYMid meet"
      />
    );
  }

  return null;
}
