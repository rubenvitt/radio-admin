export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiFetchOptions = Omit<RequestInit, 'body'> & { body?: unknown };

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { body, headers, ...rest } = options;
  const init: RequestInit = {
    credentials: 'include',
    ...rest,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(headers as Record<string, string> | undefined),
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  const res = await fetch(path, init);
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await res.json().catch(() => undefined) : undefined;

  if (!res.ok) {
    const message =
      (payload as { error?: string } | undefined)?.error ?? `HTTP ${res.status}`;
    throw new ApiError(res.status, message, payload);
  }
  return payload as T;
}

// multipart helper for CSV upload (no json content-type; browser sets boundary)
export async function apiUpload<T = unknown>(path: string, form: FormData): Promise<T> {
  const res = await fetch(path, { method: 'POST', credentials: 'include', body: form });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await res.json().catch(() => undefined) : undefined;
  if (!res.ok) {
    const message =
      (payload as { error?: string } | undefined)?.error ?? `HTTP ${res.status}`;
    throw new ApiError(res.status, message, payload);
  }
  return payload as T;
}
