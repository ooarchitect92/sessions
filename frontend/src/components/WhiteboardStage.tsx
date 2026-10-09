import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  api,
  type WhiteboardObjectRecord,
  type WhiteboardOperationKind,
  type WhiteboardOperationRecord,
  type WhiteboardState,
} from '../api/client';
import {
  publishWhiteboardCursor,
  type WhiteboardCursorRealtimePayload,
} from '../hooks/use-session-realtime';

type Tool = 'pen' | 'rectangle' | 'note' | 'text' | 'eraser';
type Point = { x: number; y: number };

const WIDTH = 1000;
const HEIGHT = 650;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function applyOperation(
  objects: Record<string, WhiteboardObjectRecord>,
  operation: Pick<WhiteboardOperationRecord, 'kind' | 'payload'>,
): Record<string, WhiteboardObjectRecord> {
  if (operation.kind === 'CLEAR') return {};
  if (operation.kind === 'OBJECT_REMOVE') {
    const objectId = operation.payload.objectId;
    if (typeof objectId !== 'string') return objects;
    const next = { ...objects };
    delete next[objectId];
    return next;
  }

  const rawObject = record(operation.payload.object);
  if (
    !rawObject ||
    typeof rawObject.id !== 'string' ||
    !['stroke', 'shape', 'note', 'text'].includes(String(rawObject.type))
  ) {
    return objects;
  }

  return {
    ...objects,
    [rawObject.id]: rawObject as WhiteboardObjectRecord,
  };
}

function materializeObjects(state: WhiteboardState | undefined) {
  if (!state) return {};
  let objects = { ...state.snapshot.objects };
  for (const operation of state.operations) {
    objects = applyOperation(objects, operation);
  }
  return objects;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function pointsValue(value: unknown): Point[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => record(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      x: numberValue(item.x),
      y: numberValue(item.y),
    }))
    .filter(
      (point) =>
        point.x >= 0 && point.x <= WIDTH && point.y >= 0 && point.y <= HEIGHT,
    );
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function WhiteboardImageObject({
  object,
  erasing,
  onRemove,
}: {
  object: WhiteboardObjectRecord;
  erasing: boolean;
  onRemove: () => void;
}) {
  const uploadId = textValue(object.uploadId);
  const upload = useQuery({
    queryKey: ['whiteboard-image-upload', uploadId],
    queryFn: () => api.getUpload(uploadId),
    enabled: Boolean(uploadId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'PENDING_SCAN' || status === 'SCANNING' ? 1500 : false;
    },
  });
  const download = useQuery({
    queryKey: ['whiteboard-image-download', uploadId],
    queryFn: () => api.createUploadDownloadGrant(uploadId),
    enabled: Boolean(uploadId && upload.data?.status === 'READY'),
    staleTime: 4 * 60 * 1000,
  });

  const x = numberValue(object.x);
  const y = numberValue(object.y);
  const width = numberValue(object.width, 360);
  const height = numberValue(object.height, 240);
  const ready =
    upload.data?.status === 'READY' &&
    upload.data.mimeType.startsWith('image/') &&
    Boolean(download.data?.url);
  const failed =
    Boolean(upload.error || download.error) ||
    ['REJECTED', 'FAILED', 'DELETED'].includes(upload.data?.status ?? '');

  return (
    <g
      className={erasing ? 'whiteboard-image-object erasing' : 'whiteboard-image-object'}
      onPointerDown={(event) => {
        if (!erasing) return;
        event.stopPropagation();
        onRemove();
      }}
    >
      <rect
        className="whiteboard-image-frame"
        x={x}
        y={y}
        width={width}
        height={height}
        rx={12}
      />
      {ready ? (
        <foreignObject x={x + 4} y={y + 4} width={Math.max(1, width - 8)} height={Math.max(1, height - 8)}>
          <div className="whiteboard-image-inner">
            <img src={download.data?.url} alt={textValue(object.filename) || 'Whiteboard image'} />
          </div>
        </foreignObject>
      ) : (
        <text
          className={failed ? 'whiteboard-image-status error' : 'whiteboard-image-status'}
          x={x + width / 2}
          y={y + height / 2}
          textAnchor="middle"
        >
          {failed ? 'Image unavailable' : 'Scanning image…'}
        </text>
      )}
    </g>
  );
}

export function WhiteboardStage({
  sessionId,
  title,
}: {
  sessionId: string;
  title: string;
}) {
  const queryClient = useQueryClient();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const lastCursorSentAt = useRef(0);
  const [tool, setTool] = useState<Tool>('pen');
  const [strokePoints, setStrokePoints] = useState<Point[]>([]);
  const [shapeStart, setShapeStart] = useState<Point | null>(null);
  const [shapeCurrent, setShapeCurrent] = useState<Point | null>(null);
  const [cursors, setCursors] = useState<
    Record<string, WhiteboardCursorRealtimePayload>
  >({});
  const [imageProgress, setImageProgress] = useState('');

  const board = useQuery({
    queryKey: ['whiteboard', sessionId],
    queryFn: () => api.getWhiteboard(sessionId),
    enabled: Boolean(sessionId),
  });

  const objects = useMemo(() => materializeObjects(board.data), [board.data]);

  useEffect(() => {
    const eventName = `sessions:whiteboard-cursor:${sessionId}`;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<WhiteboardCursorRealtimePayload>).detail;
      if (!detail || detail.sessionId !== sessionId) return;
      setCursors((current) => {
        if (!detail.visible) {
          if (!current[detail.userId]) return current;
          const next = { ...current };
          delete next[detail.userId];
          return next;
        }
        return { ...current, [detail.userId]: detail };
      });
    };
    window.addEventListener(eventName, handler);

    const cleanup = window.setInterval(() => {
      const cutoff = Date.now() - 10_000;
      setCursors((current) => {
        let changed = false;
        const next = { ...current };
        for (const [userId, cursor] of Object.entries(next)) {
          if (Date.parse(cursor.occurredAt) < cutoff) {
            delete next[userId];
            changed = true;
          }
        }
        return changed ? next : current;
      });
    }, 3000);

    return () => {
      window.removeEventListener(eventName, handler);
      window.clearInterval(cleanup);
      publishWhiteboardCursor(sessionId, { x: 0, y: 0, visible: false });
    };
  }, [sessionId]);

  const append = useMutation({
    mutationFn: ({
      kind,
      payload,
    }: {
      kind: WhiteboardOperationKind;
      payload: Record<string, unknown>;
    }) =>
      api.appendWhiteboardOperation(sessionId, {
        clientOperationId: crypto.randomUUID(),
        kind,
        payload,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['whiteboard', sessionId] });
    },
  });

  const uploadImage = useMutation({
    mutationFn: async (file: File) => {
      if (!file.type.startsWith('image/')) {
        throw new Error('Choose a supported image file.');
      }

      setImageProgress('Preparing secure image upload…');
      const prepared = await api.createUpload({
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        purpose: 'SESSION_RESOURCE',
        sessionId,
      });

      setImageProgress('Uploading image to quarantine…');
      const response = await fetch(prepared.upload.url, {
        method: prepared.upload.method,
        body: file,
        headers: { 'content-type': file.type || 'application/octet-stream' },
      });
      if (!response.ok) {
        throw new Error(`Secure image upload failed with status ${response.status}`);
      }

      setImageProgress('Scanning image before sharing…');
      await api.completeUpload(prepared.asset.id);

      const width = 360;
      const height = 240;
      await api.appendWhiteboardOperation(sessionId, {
        clientOperationId: crypto.randomUUID(),
        kind: 'IMAGE_ADD',
        payload: {
          object: {
            id: crypto.randomUUID(),
            type: 'image',
            uploadId: prepared.asset.id,
            filename: file.name,
            x: (WIDTH - width) / 2,
            y: (HEIGHT - height) / 2,
            width,
            height,
          },
        },
      });
    },
    onSuccess: async () => {
      setImageProgress('');
      if (imageInputRef.current) imageInputRef.current.value = '';
      await queryClient.invalidateQueries({ queryKey: ['whiteboard', sessionId] });
    },
    onError: () => setImageProgress(''),
  });

  const pointFor = (event: ReactPointerEvent<SVGSVGElement>): Point | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: Math.max(
        0,
        Math.min(WIDTH, ((event.clientX - rect.left) / rect.width) * WIDTH),
      ),
      y: Math.max(
        0,
        Math.min(HEIGHT, ((event.clientY - rect.top) / rect.height) * HEIGHT),
      ),
    };
  };

  const addObject = (
    kind: Extract<
      WhiteboardOperationKind,
      'STROKE_ADD' | 'SHAPE_ADD' | 'NOTE_ADD' | 'TEXT_ADD'
    >,
    object: WhiteboardObjectRecord,
  ) => append.mutate({ kind, payload: { object } });

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (append.isPending || tool === 'eraser') return;
    const point = pointFor(event);
    if (!point) return;

    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === 'pen') {
      setStrokePoints([point]);
      return;
    }
    if (tool === 'rectangle') {
      setShapeStart(point);
      setShapeCurrent(point);
      return;
    }

    if (tool === 'note') {
      const text = window.prompt('Sticky note');
      if (!text?.trim()) return;
      addObject('NOTE_ADD', {
        id: crypto.randomUUID(),
        type: 'note',
        x: point.x,
        y: point.y,
        width: 220,
        height: 120,
        text: text.trim().slice(0, 1200),
      });
      return;
    }

    if (tool === 'text') {
      const text = window.prompt('Text');
      if (!text?.trim()) return;
      addObject('TEXT_ADD', {
        id: crypto.randomUUID(),
        type: 'text',
        x: point.x,
        y: point.y,
        text: text.trim().slice(0, 1200),
      });
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const point = pointFor(event);
    if (!point) return;

    const now = performance.now();
    if (now - lastCursorSentAt.current >= 45) {
      lastCursorSentAt.current = now;
      publishWhiteboardCursor(sessionId, {
        x: point.x,
        y: point.y,
        visible: true,
      });
    }

    if (tool === 'pen' && strokePoints.length > 0) {
      setStrokePoints((points) =>
        points.length >= 800 ? points : [...points, point],
      );
    }
    if (tool === 'rectangle' && shapeStart) setShapeCurrent(point);
  };

  const handlePointerLeave = () => {
    publishWhiteboardCursor(sessionId, { x: 0, y: 0, visible: false });
  };

  const handlePointerUp = () => {
    if (tool === 'pen' && strokePoints.length >= 2) {
      addObject('STROKE_ADD', {
        id: crypto.randomUUID(),
        type: 'stroke',
        points: strokePoints,
      });
    }

    if (tool === 'rectangle' && shapeStart && shapeCurrent) {
      const x = Math.min(shapeStart.x, shapeCurrent.x);
      const y = Math.min(shapeStart.y, shapeCurrent.y);
      const width = Math.abs(shapeCurrent.x - shapeStart.x);
      const height = Math.abs(shapeCurrent.y - shapeStart.y);
      if (width >= 5 && height >= 5) {
        addObject('SHAPE_ADD', {
          id: crypto.randomUUID(),
          type: 'shape',
          shape: 'rectangle',
          x,
          y,
          width,
          height,
        });
      }
    }

    setStrokePoints([]);
    setShapeStart(null);
    setShapeCurrent(null);
  };

  const removeObject = (objectId: string) => {
    if (tool !== 'eraser' || append.isPending) return;
    append.mutate({ kind: 'OBJECT_REMOVE', payload: { objectId } });
  };

  const clearBoard = () => {
    if (
      Object.keys(objects).length > 0 &&
      window.confirm('Clear the whiteboard for everyone?')
    ) {
      append.mutate({ kind: 'CLEAR', payload: {} });
    }
  };

  if (board.isLoading) {
    return <div className="content-stage-status">Loading collaborative whiteboard…</div>;
  }

  if (board.error) {
    return (
      <div className="content-stage-placeholder error-state">
        <span className="eyebrow">Whiteboard unavailable</span>
        <h2>{title}</h2>
        <p>{board.error.message}</p>
      </div>
    );
  }

  const previewRect =
    shapeStart && shapeCurrent
      ? {
          x: Math.min(shapeStart.x, shapeCurrent.x),
          y: Math.min(shapeStart.y, shapeCurrent.y),
          width: Math.abs(shapeCurrent.x - shapeStart.x),
          height: Math.abs(shapeCurrent.y - shapeStart.y),
        }
      : null;

  return (
    <div className="whiteboard-stage">
      <div className="whiteboard-toolbar">
        <div>
          <strong>{title}</strong>
          <span>
            Synced · v{board.data?.version ?? 0} · {Object.keys(cursors).length} collaborator
            {Object.keys(cursors).length === 1 ? '' : 's'} active
            {append.isPending ? ' · saving…' : ''}
          </span>
        </div>
        <div className="whiteboard-tools" role="toolbar" aria-label="Whiteboard tools">
          {(
            [
              ['pen', 'Pen'],
              ['rectangle', 'Rectangle'],
              ['note', 'Sticky'],
              ['text', 'Text'],
              ['eraser', 'Eraser'],
            ] as const
          ).map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={tool === value ? 'active' : ''}
              onClick={() => setTool(value)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            disabled={uploadImage.isPending}
            onClick={() => imageInputRef.current?.click()}
          >
            {uploadImage.isPending ? 'Uploading…' : 'Image'}
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) uploadImage.mutate(file);
            }}
          />
          <button type="button" className="danger-tool" onClick={clearBoard}>
            Clear
          </button>
        </div>
      </div>

      <div className="whiteboard-canvas-wrap">
        <svg
          ref={svgRef}
          className={`whiteboard-canvas tool-${tool}`}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        >
          <rect width={WIDTH} height={HEIGHT} className="whiteboard-background" />

          {Object.values(objects).map((object) => {
            if (object.type === 'stroke') {
              const points = pointsValue(object.points);
              if (points.length < 2) return null;
              return (
                <polyline
                  key={object.id}
                  className="whiteboard-stroke"
                  points={points.map((point) => `${point.x},${point.y}`).join(' ')}
                  onPointerDown={(event) => {
                    if (tool !== 'eraser') return;
                    event.stopPropagation();
                    removeObject(object.id);
                  }}
                />
              );
            }

            if (object.type === 'shape') {
              return (
                <rect
                  key={object.id}
                  className="whiteboard-shape"
                  x={numberValue(object.x)}
                  y={numberValue(object.y)}
                  width={numberValue(object.width)}
                  height={numberValue(object.height)}
                  rx={10}
                  onPointerDown={(event) => {
                    if (tool !== 'eraser') return;
                    event.stopPropagation();
                    removeObject(object.id);
                  }}
                />
              );
            }

            if (object.type === 'note') {
              const x = numberValue(object.x);
              const y = numberValue(object.y);
              const width = numberValue(object.width, 220);
              const height = numberValue(object.height, 120);
              return (
                <g
                  key={object.id}
                  onPointerDown={(event) => {
                    if (tool !== 'eraser') return;
                    event.stopPropagation();
                    removeObject(object.id);
                  }}
                >
                  <rect
                    className="whiteboard-note"
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    rx={10}
                  />
                  <foreignObject x={x + 12} y={y + 12} width={width - 24} height={height - 24}>
                    <div className="whiteboard-note-text">{textValue(object.text)}</div>
                  </foreignObject>
                </g>
              );
            }

            if (object.type === 'image') {
              return (
                <WhiteboardImageObject
                  key={object.id}
                  object={object}
                  erasing={tool === 'eraser'}
                  onRemove={() => removeObject(object.id)}
                />
              );
            }

            return (
              <text
                key={object.id}
                className="whiteboard-text"
                x={numberValue(object.x)}
                y={numberValue(object.y)}
                onPointerDown={(event) => {
                  if (tool !== 'eraser') return;
                  event.stopPropagation();
                  removeObject(object.id);
                }}
              >
                {textValue(object.text)}
              </text>
            );
          })}

          {Object.values(cursors).map((cursor) => (
            <g
              key={cursor.userId}
              className="whiteboard-collaborator-cursor"
              transform={`translate(${cursor.x} ${cursor.y})`}
              pointerEvents="none"
            >
              <path d="M0 0 L0 24 L7 17 L13 30 L18 27 L12 15 L23 15 Z" />
              <rect x={18} y={20} width={Math.max(72, cursor.displayName.length * 7 + 18)} height={24} rx={8} />
              <text x={27} y={36}>{cursor.displayName.slice(0, 28)}</text>
            </g>
          ))}

          {strokePoints.length > 1 ? (
            <polyline
              className="whiteboard-stroke preview"
              points={strokePoints.map((point) => `${point.x},${point.y}`).join(' ')}
            />
          ) : null}

          {previewRect ? (
            <rect
              className="whiteboard-shape preview"
              x={previewRect.x}
              y={previewRect.y}
              width={previewRect.width}
              height={previewRect.height}
              rx={10}
            />
          ) : null}
        </svg>
      </div>

      {imageProgress ? (
        <div className="whiteboard-upload-status">{imageProgress}</div>
      ) : null}
      {uploadImage.error ? (
        <div className="error-banner whiteboard-error">{uploadImage.error.message}</div>
      ) : null}
      {append.error ? (
        <div className="error-banner whiteboard-error">{append.error.message}</div>
      ) : null}
    </div>
  );
}
