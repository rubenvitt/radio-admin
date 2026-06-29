import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithQuery } from '../../test/utils';
import { LoanList } from './LoanList';

const loans = [
  {
    id: 'l1',
    deviceId: 'd1',
    snapshotCallSign: 'Florian 4-23',
    snapshotSerialNumber: 'SN1',
    snapshotDeviceType: 'HRT',
    borrowerName: 'Max Mustermann',
    borrowedAt: 1_700_000_000_000,
    returnedAt: null,
    returnNote: null,
  },
  {
    id: 'l2',
    deviceId: 'd2',
    snapshotCallSign: 'Florian 1-01',
    snapshotSerialNumber: null,
    snapshotDeviceType: null,
    borrowerName: 'Erika Beispiel',
    borrowedAt: 1_700_000_000_000,
    returnedAt: 1_700_100_000_000,
    returnNote: 'Akku leer',
  },
];

beforeEach(() => {
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ rows: loans, total: 2, page: 1, pageSize: 20 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
});

afterEach(() => vi.restoreAllMocks());

describe('LoanList', () => {
  it('renders active and returned loans with their status', async () => {
    renderWithQuery(<LoanList />);
    expect(await screen.findByText('Florian 4-23')).toBeInTheDocument();
    expect(screen.getByText('Max Mustermann')).toBeInTheDocument();
    expect(screen.getByText('Erika Beispiel')).toBeInTheDocument();
    expect(screen.getByText('Aktiv')).toBeInTheDocument();
    expect(screen.getByText('Zurückgegeben')).toBeInTheDocument();
    expect(screen.getByText('Akku leer')).toBeInTheDocument();
  });
});
