export class PublicApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'PublicApiError';
  }
}

interface ApiEnvelope<T> {
  data: T;
  meta: {
    requestId: string;
    timestamp: string;
  };
}

export async function publicApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  headers.set('x-request-id', crypto.randomUUID());

  const response = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
    ...init,
    headers,
  });
  const requestId = response.headers.get('x-request-id') ?? undefined;
  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<T>
    | { error?: { message?: string; requestId?: string } }
    | null;

  if (!response.ok) {
    const message =
      payload && 'error' in payload
        ? payload.error?.message ?? `Request failed (${response.status})`
        : `Request failed (${response.status})`;
    const errorRequestId =
      payload && 'error' in payload ? payload.error?.requestId : undefined;
    throw new PublicApiError(message, response.status, errorRequestId ?? requestId);
  }
  if (!payload || !('data' in payload)) {
    throw new PublicApiError('The service returned an invalid response', response.status, requestId);
  }
  return payload.data;
}
