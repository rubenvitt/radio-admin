import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, test, vi } from 'vitest';
import type { Role } from '@ra/shared';
import { DeviceEditForm } from './DeviceEditForm';
import type { DeviceListItem } from '../../hooks/useDevices';

afterEach(() => vi.restoreAllMocks());

// Suggestion/software-version queries fire on mount; return empty arrays so the
// Comboboxes render without network. The list shape matches each hook.
function stubFetch() {
  vi.spyOn(global, 'fetch').mockImplementation((input) => {
    const url = String(input);
    const body = url.includes('/api/software-versions') ? [] : url.includes('/api/suggestions') ? [] : {};
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
}

const device: DeviceListItem = {
  id: '1',
  rufname: 'Florian 1',
  issi: '1001',
  serialNumber: 'SN1',
  deviceType: 'MTM5400',
  status: 'Einsatzbereit',
  location: 'Wache',
  assignedTo: 'Zug 1',
  softwareVersion: 'FW 12.3',
  lastUpdatedAt: 1_700_000_000_000,
  notes: null,
  hiorgId: null,
  opta: null,
  funktion: null,
  hersteller: null,
  bedieneinheit: null,
  deviceModes: 'TMO,DMO',
  alamosIntegrated: true,
  loanable: false,
  createdAt: 1,
  updatedAt: 1,
  createdBy: null,
  updatedBy: null,
  updateStatus: 'aktuell',
};

function renderForm(role: Role) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DeviceEditForm device={device} role={role} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

test('updater: identity fields are locked, update fields editable', () => {
  stubFetch();
  renderForm('updater');
  // Plain Input identity field locked.
  expect(screen.getByLabelText('ISSI')).toBeDisabled();
  expect(screen.getByLabelText('Seriennummer')).toBeDisabled();
  // Combobox identity field locked (verifies the Combobox forwards `id`/disabled).
  expect(screen.getByLabelText('Rufname')).toBeDisabled();
  // loanable is master data (not in UPDATER_EDITABLE_FIELDS) → locked for updaters.
  expect(screen.getByLabelText('Für Ausleihe freigegeben')).toBeDisabled();
  // Allowlisted update fields stay enabled (Status select + softwareVersion Combobox).
  expect(screen.getByLabelText('Status')).toBeEnabled();
  expect(screen.getByLabelText('Letztes Update')).toBeEnabled();
});

test('admin: all fields editable', () => {
  stubFetch();
  renderForm('admin');
  expect(screen.getByLabelText('ISSI')).toBeEnabled();
  expect(screen.getByLabelText('Rufname')).toBeEnabled();
  expect(screen.getByLabelText('Status')).toBeEnabled();
  expect(screen.getByLabelText('Letztes Update')).toBeEnabled();
});

test('untouched save of a device with alamosIntegrated=null sends no patch for it', async () => {
  // The Checkbox renders null as unchecked (false); without the diff special-case
  // an untouched save would spuriously PATCH { alamosIntegrated: false }.
  const patches: Array<Record<string, unknown>> = [];
  vi.spyOn(global, 'fetch').mockImplementation((input, init) => {
    const url = String(input);
    if (url.endsWith('/api/devices/1') && init?.method === 'PATCH') {
      patches.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return Promise.resolve(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    }
    const body = url.includes('/api/software-versions') || url.includes('/api/suggestions') ? [] : {};
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  const onClose = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DeviceEditForm device={{ ...device, alamosIntegrated: null }} role="admin" onClose={onClose} />
    </QueryClientProvider>,
  );

  await userEvent.setup().click(screen.getByRole('button', { name: 'Speichern' }));

  // Nothing changed -> the form closes without any PATCH at all.
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(patches).toHaveLength(0);
});
