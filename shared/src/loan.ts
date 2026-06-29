import { z } from 'zod';

/** Input length caps for loan payloads (mirror radio-inventar's column limits). */
export const LOAN_FIELD_LIMITS = Object.freeze({
  BORROWER_NAME_MAX: 100,
  RETURN_NOTE_MAX: 500,
} as const);

export type DeviceCondition = 'AVAILABLE' | 'DEFECT' | 'MAINTENANCE';

/**
 * Map radio-admin's free-text device `status` to a loan condition. Mirrors
 * radio-inventar's `mapRadioAdminStatus` minus the ON_LOAN overlay (loan state
 * is now derived from the loans table, not the status field): `defekt` → DEFECT,
 * `wartung` → MAINTENANCE (case-insensitive after trimming); anything else —
 * including null, "Einsatzbereit" or a stale "Ausgeliehen" — is AVAILABLE.
 * A non-AVAILABLE device cannot be borrowed.
 */
export function mapDeviceCondition(status: string | null): DeviceCondition {
  switch (status?.trim().toLowerCase()) {
    case 'defekt':
      return 'DEFECT';
    case 'wartung':
      return 'MAINTENANCE';
    default:
      return 'AVAILABLE';
  }
}

/**
 * Create-loan payload (radio-inventar kiosk → radio-admin S2S). The device
 * snapshot (call sign / serial / type) is taken server-side from the device
 * master record, so the caller only supplies the device id and the borrower;
 * unknown keys are stripped.
 */
export const createLoanSchema = z
  .object({
    deviceId: z.string().min(1),
    borrowerName: z.string().trim().min(1).max(LOAN_FIELD_LIMITS.BORROWER_NAME_MAX),
  })
  .strip();

/**
 * Return-loan payload. An omitted / empty / whitespace-only note normalises to
 * null so the stored column stays clean.
 */
export const returnLoanSchema = z
  .object({
    returnNote: z
      .string()
      .trim()
      .max(LOAN_FIELD_LIMITS.RETURN_NOTE_MAX)
      .nullish()
      .transform((v) => (v && v.length > 0 ? v : null)),
  })
  .strip();

/**
 * A loan as returned by the API. Timestamps are epoch-ms integers — radio-admin's
 * canonical wire format, consistent with the device timestamps and the client's
 * `formatTimestamp` helper. `returnedAt === null` means the loan is still active.
 */
export const loanRecordSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  snapshotCallSign: z.string(),
  snapshotSerialNumber: z.string().nullable(),
  snapshotDeviceType: z.string().nullable(),
  borrowerName: z.string(),
  borrowedAt: z.number().int(),
  returnedAt: z.number().int().nullable(),
  returnNote: z.string().nullable(),
});

/**
 * Active-loan projection consumed by radio-inventar (device-status overlay +
 * dashboard active-loans list). A strict subset of {@link loanRecordSchema}.
 */
export const activeLoanSchema = loanRecordSchema.pick({
  id: true,
  deviceId: true,
  snapshotCallSign: true,
  snapshotDeviceType: true,
  borrowerName: true,
  borrowedAt: true,
});

/**
 * Paginated loan-history query params. `from`/`to` are epoch-ms bounds on
 * `borrowedAt`. The page-size ceiling matches radio-inventar's existing history
 * page size (1000) so the thin-client consumer is never rejected.
 */
export const loanHistoryParamsSchema = z.object({
  deviceId: z.string().min(1).optional(),
  from: z.coerce.number().int().optional(),
  to: z.coerce.number().int().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(25),
});

/** Paginated loan-history response envelope. */
export const loanHistoryResponseSchema = z.object({
  rows: z.array(loanRecordSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

/** Borrower-suggestion limits (mirror radio-inventar's BORROWER_SUGGESTIONS). */
export const BORROWER_SUGGESTION_LIMITS = Object.freeze({
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 50,
} as const);

/** Query params for the borrower-suggestions autocomplete endpoint. */
export const borrowerSuggestionsQuerySchema = z.object({
  q: z.string().trim().min(1),
  limit: z.coerce.number().int().min(1).default(BORROWER_SUGGESTION_LIMITS.DEFAULT_LIMIT),
});

/**
 * A borrower-name suggestion. `lastUsed` is the most recent borrow time
 * (epoch-ms). radio-inventar's kiosk autocomplete is keyed on these; the
 * consumer maps `lastUsed` back to a Date.
 */
export const borrowerSuggestionSchema = z.object({
  name: z.string(),
  lastUsed: z.number().int(),
});

export type BorrowerSuggestionsQuery = z.infer<typeof borrowerSuggestionsQuerySchema>;
export type BorrowerSuggestion = z.infer<typeof borrowerSuggestionSchema>;

export type CreateLoan = z.infer<typeof createLoanSchema>;
export type ReturnLoan = z.infer<typeof returnLoanSchema>;
export type LoanRecord = z.infer<typeof loanRecordSchema>;
export type ActiveLoan = z.infer<typeof activeLoanSchema>;
export type LoanHistoryParams = z.infer<typeof loanHistoryParamsSchema>;
export type LoanHistoryResponse = z.infer<typeof loanHistoryResponseSchema>;
