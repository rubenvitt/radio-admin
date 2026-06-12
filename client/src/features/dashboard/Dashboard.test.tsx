import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { Dashboard } from './Dashboard';

afterEach(() => vi.restoreAllMocks());

// Distinct totals per updateStatus filter so each Statistic is identifiable.
function stubFetch() {
  vi.spyOn(global, 'fetch').mockImplementation((input) => {
    const url = String(input);
    let total = 10; // unfiltered grand total
    if (url.includes('updateStatus=aktuell')) total = 4;
    else if (url.includes('updateStatus=veraltet')) total = 5;
    else if (url.includes('updateStatus=unbekannt')) total = 1;
    return Promise.resolve(
      new Response(JSON.stringify({ rows: [], total, page: 1, pageSize: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
}

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test('renders the four status Statistic cards with their counts', async () => {
  stubFetch();
  renderDashboard();

  // The "Veraltet" card shows its mocked count (5); grand total (10) renders too.
  await waitFor(() => expect(screen.getByText('Veraltet')).toBeInTheDocument());
  await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument());
  expect(screen.getByText('Aktuell')).toBeInTheDocument();
  expect(screen.getByText('Unbekannt')).toBeInTheDocument();
  expect(screen.getByText('Geräte gesamt')).toBeInTheDocument();
  expect(screen.getByText('10')).toBeInTheDocument();
});
