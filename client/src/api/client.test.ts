import { afterEach, expect, test, vi } from 'vitest';
import { apiFetch } from './client';

afterEach(() => vi.restoreAllMocks());

test('GET parses JSON and sends credentials', async () => {
  const spy = vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
  const data = await apiFetch<{ ok: boolean }>('/api/devices');
  expect(data).toEqual({ ok: true });
  expect(spy).toHaveBeenCalledWith(
    '/api/devices',
    expect.objectContaining({ credentials: 'include' }),
  );
});

test('throws ApiError with status on non-2xx', async () => {
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    }),
  );
  await expect(apiFetch('/api/devices')).rejects.toMatchObject({
    status: 403,
    name: 'ApiError',
  });
});

test('POST serializes body and sets json content-type', async () => {
  const spy = vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ id: '1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
  await apiFetch('/api/devices', { method: 'POST', body: { issi: '1001' } });
  const init = spy.mock.calls[0]?.[1] as RequestInit;
  expect(init.method).toBe('POST');
  expect(init.body).toBe(JSON.stringify({ issi: '1001' }));
  expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
});
