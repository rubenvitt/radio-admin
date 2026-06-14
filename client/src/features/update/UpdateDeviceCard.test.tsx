import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { UpdateDeviceCard } from './UpdateDeviceCard';
import type { DeviceListItem } from '../../hooks/useDevices';

const device = { id: 'd1', issi: '1001', rufname: 'Alpha', funktion: 'Zugführer', deviceType: 'MRT', updateStatus: 'veraltet', updateNote: null } as unknown as DeviceListItem;

beforeEach(() => {
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ id: 'd1', updateStatus: 'aktuell' }), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
});
afterEach(() => vi.restoreAllMocks());

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><UpdateDeviceCard device={device} targetVersion="v2.4.1" /></QueryClientProvider>);
}

test('one-tap apply PATCHes softwareVersion + lastUpdatedAt', async () => {
  const user = userEvent.setup();
  renderCard();
  await user.click(screen.getByRole('button', { name: /Auf v2.4.1 aktualisiert/i }));
  const calls = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
  const patch = calls.find(([url, o]) => url === '/api/devices/d1' && o.method === 'PATCH');
  expect(patch).toBeTruthy();
  const body = JSON.parse(patch![1].body as string);
  expect(body.softwareVersion).toBe('v2.4.1');
  expect(typeof body.lastUpdatedAt).toBe('number');
});

test('note expander posts to the append endpoint', async () => {
  const user = userEvent.setup();
  renderCard();
  await user.click(screen.getByRole('button', { name: /ISSI weicht ab/i }));
  await user.type(screen.getByPlaceholderText(/echte ISSI/i), 'ISSI 999');
  await user.click(screen.getByRole('button', { name: 'Speichern' }));
  const calls = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
  expect(calls.some(([url]) => url === '/api/devices/d1/update-note')).toBe(true);
});
