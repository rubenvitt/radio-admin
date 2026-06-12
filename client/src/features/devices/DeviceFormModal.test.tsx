import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, test, vi } from 'vitest';
import { DeviceFormModal } from './DeviceFormModal';

afterEach(() => vi.restoreAllMocks());

function stubFetch() {
  vi.spyOn(global, 'fetch').mockImplementation((input) => {
    const url = String(input);
    const body = url.includes('/api/software-versions') || url.includes('/api/suggestions') ? [] : {};
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
}

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DeviceFormModal open onClose={() => {}} />
    </QueryClientProvider>,
  );
}

test('ISSI is required and an empty submit surfaces a validation error', async () => {
  stubFetch();
  const user = userEvent.setup();
  renderModal();

  // ISSI field is rendered and marked required.
  const issi = screen.getByLabelText('ISSI');
  expect(issi).toBeRequired();

  // Submitting with empty ISSI surfaces the required-validation message.
  await user.click(screen.getByRole('button', { name: 'Anlegen' }));
  await waitFor(() => expect(screen.getByText('ISSI ist erforderlich')).toBeInTheDocument());
});
