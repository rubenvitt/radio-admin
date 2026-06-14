import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi, beforeEach, afterEach } from 'vitest';
import { DeviceFilterDrawer, countActiveFilters } from './DeviceFilterDrawer';

beforeEach(() => {
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ values: ['MRT', 'HRT'] }), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
});
afterEach(() => vi.restoreAllMocks());

test('countActiveFilters counts arrays, booleans and single values', () => {
  expect(countActiveFilters({})).toBe(0);
  expect(countActiveFilters({ deviceType: ['MRT'], loanable: true, updateStatus: 'veraltet' })).toBe(3);
});

test('Anwenden emits the chosen status filter', async () => {
  const user = userEvent.setup();
  const onApply = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DeviceFilterDrawer open value={{}} onClose={() => {}} onApply={onApply} />
    </QueryClientProvider>,
  );
  // open the Status select and pick "Wartung"
  await user.click(screen.getByLabelText('Status'));
  await user.click(await screen.findByText('Wartung'));
  await user.click(screen.getByRole('button', { name: 'Anwenden' }));
  expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ status: ['Wartung'] }));
});

test('seeded suggestion-backed filters render their selected values', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DeviceFilterDrawer open value={{ deviceType: ['MRT'] }} onClose={() => {}} onApply={() => {}} />
    </QueryClientProvider>,
  );
  // The Gerät SuggestSelect (bound via Form.Item) shows the seeded value as a tag.
  expect(await screen.findByText('MRT')).toBeInTheDocument();
});
