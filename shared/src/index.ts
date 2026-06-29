export { DEVICE_MODES, STATUS_OPTIONS } from './constants';
export type { DeviceMode, StatusOption } from './constants';

export type { Role } from './role';
export { mapGroupsToRole } from './role';

export type { UpdateStatus } from './update-status';
export { computeUpdateStatus } from './update-status';

export { UPDATER_EDITABLE_FIELDS, filterEditableFields } from './editable-fields';

export { diffDevice } from './diff-device';

export { appendUpdateNote } from './update-note';

export { classifyImportRow } from './import/classify-import-row';
export type { ClassifyResult } from './import/classify-import-row';

export { autoMapHeaders, IMPORTABLE_FIELDS } from './import/auto-map-headers';
export type { ImportableField } from './import/auto-map-headers';

export {
  suggestionFieldEnum,
  deviceRecordSchema,
  deviceCreateSchema,
  devicePatchSchema,
  importCommitSchema,
  updateNoteSchema,
} from './schemas';
export type {
  DeviceRecord,
  DeviceCreate,
  DevicePatch,
  ImportCommit,
  SuggestionField,
  FieldDiff,
  ImportRowClass,
  UpdateNoteInput,
} from './schemas';

export {
  LOAN_FIELD_LIMITS,
  mapDeviceCondition,
  createLoanSchema,
  returnLoanSchema,
  loanRecordSchema,
  activeLoanSchema,
  loanHistoryParamsSchema,
  loanHistoryResponseSchema,
} from './loan';
export type {
  DeviceCondition,
  CreateLoan,
  ReturnLoan,
  LoanRecord,
  ActiveLoan,
  LoanHistoryParams,
  LoanHistoryResponse,
} from './loan';
