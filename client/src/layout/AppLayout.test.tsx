import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { ThemeProvider } from '../theme/ThemeProvider';
import { AppLayout } from './AppLayout';

afterEach(() => vi.restoreAllMocks());

function renderLayout() {
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ name: 'Alice', role: 'admin' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<div>home content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

test('mobile: hamburger opens drawer with nav links', async () => {
  const user = userEvent.setup();
  renderLayout();

  // matchMedia mock returns matches:false → mobile branch (!screens.md).
  const menuButton = await screen.findByRole('button', { name: /menü|menu/i });
  expect(menuButton).toBeInTheDocument();

  await user.click(menuButton);

  const drawer = await screen.findByRole('dialog');
  expect(within(drawer).getByText('Geräte')).toBeInTheDocument();
  expect(within(drawer).getByText('Import')).toBeInTheDocument();
  // The admin-only settings item shows for the admin user mocked above.
  expect(within(drawer).getByText('Einstellungen')).toBeInTheDocument();
});

test('renders the theme toggle button', async () => {
  renderLayout();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /design|theme|hell|dunkel/i })).toBeInTheDocument(),
  );
});
