import { describe, it, expect } from 'vitest';
import {
  createLoanSchema,
  returnLoanSchema,
  loanRecordSchema,
  activeLoanSchema,
  loanHistoryParamsSchema,
  LOAN_FIELD_LIMITS,
} from './loan';

describe('createLoanSchema', () => {
  it('accepts a device id + borrower and trims the name, stripping unknown keys', () => {
    const parsed = createLoanSchema.parse({
      deviceId: 'dev123',
      borrowerName: '  Max Mustermann  ',
      sneaky: 'ignored',
    });
    expect(parsed).toEqual({ deviceId: 'dev123', borrowerName: 'Max Mustermann' });
    expect('sneaky' in parsed).toBe(false);
  });

  it('rejects an empty borrower name and a missing device id', () => {
    expect(createLoanSchema.safeParse({ deviceId: 'd', borrowerName: '   ' }).success).toBe(false);
    expect(createLoanSchema.safeParse({ borrowerName: 'Max' }).success).toBe(false);
    expect(createLoanSchema.safeParse({ deviceId: '', borrowerName: 'Max' }).success).toBe(false);
  });

  it('enforces the borrower-name length cap', () => {
    const tooLong = 'x'.repeat(LOAN_FIELD_LIMITS.BORROWER_NAME_MAX + 1);
    expect(createLoanSchema.safeParse({ deviceId: 'd', borrowerName: tooLong }).success).toBe(false);
  });
});

describe('returnLoanSchema', () => {
  it('normalises an omitted / empty / whitespace note to null', () => {
    expect(returnLoanSchema.parse({})).toEqual({ returnNote: null });
    expect(returnLoanSchema.parse({ returnNote: '' })).toEqual({ returnNote: null });
    expect(returnLoanSchema.parse({ returnNote: '   ' })).toEqual({ returnNote: null });
  });

  it('trims and keeps a real note', () => {
    expect(returnLoanSchema.parse({ returnNote: '  Display kaputt ' })).toEqual({
      returnNote: 'Display kaputt',
    });
  });

  it('rejects a note over the length cap', () => {
    const tooLong = 'x'.repeat(LOAN_FIELD_LIMITS.RETURN_NOTE_MAX + 1);
    expect(returnLoanSchema.safeParse({ returnNote: tooLong }).success).toBe(false);
  });
});

describe('loanRecordSchema / activeLoanSchema', () => {
  it('validates a full loan record with epoch-ms timestamps', () => {
    const rec = {
      id: 'loan1',
      deviceId: 'dev1',
      snapshotCallSign: 'Florian 4-23',
      snapshotSerialNumber: null,
      snapshotDeviceType: 'Funkgerät',
      borrowerName: 'Max',
      borrowedAt: 1_700_000_000_000,
      returnedAt: null,
      returnNote: null,
    };
    expect(loanRecordSchema.parse(rec)).toEqual(rec);
  });

  it('active-loan projection drops returned/return-note/serial fields', () => {
    const active = activeLoanSchema.parse({
      id: 'loan1',
      deviceId: 'dev1',
      snapshotCallSign: 'Florian 4-23',
      snapshotDeviceType: 'Funkgerät',
      borrowerName: 'Max',
      borrowedAt: 1_700_000_000_000,
    });
    expect(Object.keys(active).sort()).toEqual(
      ['borrowedAt', 'borrowerName', 'deviceId', 'id', 'snapshotCallSign', 'snapshotDeviceType'].sort(),
    );
  });
});

describe('loanHistoryParamsSchema', () => {
  it('applies defaults and coerces numeric query strings', () => {
    expect(loanHistoryParamsSchema.parse({})).toEqual({ page: 1, pageSize: 25 });
    const parsed = loanHistoryParamsSchema.parse({
      page: '2',
      pageSize: '50',
      from: '1700000000000',
      deviceId: 'dev1',
    });
    expect(parsed).toEqual({ page: 2, pageSize: 50, from: 1_700_000_000_000, deviceId: 'dev1' });
  });

  it('rejects page < 1 and pageSize over the ceiling', () => {
    expect(loanHistoryParamsSchema.safeParse({ page: 0 }).success).toBe(false);
    expect(loanHistoryParamsSchema.safeParse({ pageSize: 1001 }).success).toBe(false);
  });
});
