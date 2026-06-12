import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, test, vi } from 'vitest';
import { ApiTokensPage } from './ApiTokensPage';
import type { ApiToken } from '../../hooks/useApiTokens';

afterEach(() => vi.restoreAllMocks());

const existing: ApiToken[] = [
  {
    id: 't1',
    name: 'Ausleih-Dienst',
    prefix: 'ra_abc',
    createdAt: 1_700_000_000_000,
    lastUsedAt: null,
    revokedAt: null,
  },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ApiTokensPage />
    </QueryClientProvider>,
  );
}

test('lists tokens from the bare-array endpoint and documents the loan API', async () => {
  vi.spyOn(global, 'fetch').mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith('/api/tokens')) {
      // The list endpoint returns a BARE ARRAY (no { values } envelope).
      return Promise.resolve(
        new Response(JSON.stringify(existing), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    return Promise.resolve(new Response('{}', { status: 200 }));
  });

  renderPage();

  expect(await screen.findByText('Ausleih-Dienst')).toBeInTheDocument();
  expect(screen.getByText('ra_abc')).toBeInTheDocument();
  // The loan API is documented for the admin (endpoint path appears in the page).
  expect(screen.getByText(/\/api\/v1\/loan-devices/)).toBeInTheDocument();
});

test('creating a token shows the one-time plaintext with a single-use warning', async () => {
  const user = userEvent.setup();
  const created = {
    id: 't2',
    name: 'Neuer Dienst',
    token: 'ra_secret_plaintext_value',
    prefix: 'ra_sec',
    createdAt: 1_700_000_100_000,
  };
  vi.spyOn(global, 'fetch').mockImplementation((input, init) => {
    const url = String(input);
    if (url.endsWith('/api/tokens') && init?.method === 'POST') {
      return Promise.resolve(
        new Response(JSON.stringify(created), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    if (url.endsWith('/api/tokens')) {
      return Promise.resolve(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    return Promise.resolve(new Response('{}', { status: 200 }));
  });

  renderPage();

  await user.click(screen.getByRole('button', { name: /Token erstellen/i }));
  const createDialog = await screen.findByRole('dialog');
  await user.type(within(createDialog).getByLabelText('Name'), 'Neuer Dienst');
  await user.click(within(createDialog).getByRole('button', { name: 'Erstellen' }));

  // The plaintext token (in a read-only Input) and the single-use warning surface.
  expect(await screen.findByDisplayValue('ra_secret_plaintext_value')).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByText(/nur einmal angezeigt/i)).toBeInTheDocument(),
  );
});

test('revoking a token deletes it and refreshes the list', async () => {
  const user = userEvent.setup();
  const deletes: string[] = [];
  vi.spyOn(global, 'fetch').mockImplementation((input, init) => {
    const url = String(input);
    if (url.endsWith('/api/tokens/t1') && init?.method === 'DELETE') {
      deletes.push(url);
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (url.endsWith('/api/tokens')) {
      return Promise.resolve(
        new Response(JSON.stringify(existing), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    return Promise.resolve(new Response('{}', { status: 200 }));
  });

  renderPage();

  await screen.findByText('Ausleih-Dienst');
  // The row-level "Widerrufen" button opens the Popconfirm.
  await user.click(screen.getByRole('button', { name: /Widerrufen/i }));
  // The Popconfirm OK button is also labelled "Widerrufen"; once open there are
  // two such buttons — the confirm action is the last one rendered (the popup).
  await waitFor(() =>
    expect(screen.getAllByRole('button', { name: /Widerrufen/i }).length).toBeGreaterThan(1),
  );
  const buttons = screen.getAllByRole('button', { name: /Widerrufen/i });
  await user.click(buttons.at(-1) as HTMLElement);

  await waitFor(() => expect(deletes).toHaveLength(1));
});
