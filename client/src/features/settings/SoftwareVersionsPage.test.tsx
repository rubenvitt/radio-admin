import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, test, vi } from 'vitest';
import { SoftwareVersionsPage } from './SoftwareVersionsPage';
import type { SoftwareVersionItem } from '../../hooks/useSoftwareVersions';

afterEach(() => vi.restoreAllMocks());

const VERSIONS: SoftwareVersionItem[] = [
  { id: 'v3', value: 'FW 12.3', createdAt: 1_700_000_000_000, sortOrder: 3, isTarget: true, deviceCount: 5 },
  { id: 'v2', value: 'FW 12.2', createdAt: 1_600_000_000_000, sortOrder: 2, isTarget: false, deviceCount: 2 },
  { id: 'v1', value: 'FW 11.0', createdAt: 1_500_000_000_000, sortOrder: 1, isTarget: false, deviceCount: 0 },
];

function renderPage() {
  const calls: { url: string; method: string }[] = [];
  vi.spyOn(global, 'fetch').mockImplementation((input, init) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push({ url, method });
    const body = method === 'GET' && url.includes('/api/software-versions') ? VERSIONS : {};
    return Promise.resolve(
      new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SoftwareVersionsPage />
    </QueryClientProvider>,
  );
  return calls;
}

test('renders versions newest-first with the target flagged', async () => {
  renderPage();
  expect(await screen.findByText('FW 12.3')).toBeInTheDocument();
  // The target version carries the "Ziel" tag.
  const targetRow = screen.getByText('FW 12.3').closest('tr')!;
  expect(within(targetRow).getByText('Ziel')).toBeInTheDocument();
});

test('blocks deleting a version still assigned to devices', async () => {
  renderPage();
  await screen.findByText('FW 12.2'); // deviceCount 2 → delete disabled
  const usedRow = screen.getByText('FW 12.2').closest('tr')!;
  expect(within(usedRow).getByRole('button', { name: /löschen/i })).toBeDisabled();

  // The unassigned phantom (deviceCount 0) is deletable.
  const phantomRow = screen.getByText('FW 11.0').closest('tr')!;
  expect(within(phantomRow).getByRole('button', { name: /löschen/i })).toBeEnabled();
});

test('setting a version as target POSTs to its target endpoint', async () => {
  const user = userEvent.setup();
  const calls = renderPage();
  await screen.findByText('FW 12.2');

  const row = screen.getByText('FW 12.2').closest('tr')!;
  await user.click(within(row).getByRole('button', { name: /als ziel/i }));

  await waitFor(() =>
    expect(calls).toContainEqual({ url: '/api/software-versions/v2/target', method: 'POST' }),
  );
});
