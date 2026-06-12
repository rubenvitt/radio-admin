import { z } from 'zod';

// Combobox-suggestable text fields (NOT issi, NOT softwareVersion, NOT hiorgId).
export const suggestionFieldEnum = z.enum([
  'rufname',
  'deviceType',
  'status',
  'location',
  'assignedTo',
  'opta',
  'funktion',
  'hersteller',
  'bedieneinheit',
]);

// Full device record shape (server-owned fields included) for typing DeviceRecord.
export const deviceRecordSchema = z.object({
  id: z.string(),
  rufname: z.string().nullable(),
  issi: z.string().min(1),
  serialNumber: z.string().nullable(),
  deviceType: z.string().nullable(),
  status: z.string().nullable(),
  location: z.string().nullable(),
  assignedTo: z.string().nullable(),
  softwareVersion: z.string().nullable(),
  lastUpdatedAt: z.number().int().nullable(),
  notes: z.string().nullable(),
  // New customer master-data fields (all nullable).
  hiorgId: z.string().nullable(),
  opta: z.string().nullable(),
  funktion: z.string().nullable(),
  hersteller: z.string().nullable(),
  bedieneinheit: z.string().nullable(),
  // Canonical comma-joined subset of DEVICE_MODES, e.g. "TMO,DMO" (plain string).
  deviceModes: z.string().nullable(),
  alamosIntegrated: z.boolean().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
});

// Create payload: issi required + non-empty; user-editable fields optional/nullable;
// server-owned fields (id/createdAt/updatedAt/...) are NOT accepted (strip unknown keys).
export const deviceCreateSchema = z
  .object({
    issi: z.string().min(1),
    rufname: z.string().nullable().optional(),
    serialNumber: z.string().nullable().optional(),
    deviceType: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    assignedTo: z.string().nullable().optional(),
    softwareVersion: z.string().nullable().optional(),
    lastUpdatedAt: z.number().int().nullable().optional(),
    notes: z.string().nullable().optional(),
    hiorgId: z.string().nullable().optional(),
    opta: z.string().nullable().optional(),
    funktion: z.string().nullable().optional(),
    hersteller: z.string().nullable().optional(),
    bedieneinheit: z.string().nullable().optional(),
    deviceModes: z.string().nullable().optional(),
    alamosIntegrated: z.boolean().nullable().optional(),
  })
  .strip();

// Patch payload: every field optional; issi must be non-empty when present.
export const devicePatchSchema = z
  .object({
    issi: z.string().min(1).optional(),
    rufname: z.string().nullable().optional(),
    serialNumber: z.string().nullable().optional(),
    deviceType: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    assignedTo: z.string().nullable().optional(),
    softwareVersion: z.string().nullable().optional(),
    lastUpdatedAt: z.number().int().nullable().optional(),
    notes: z.string().nullable().optional(),
    hiorgId: z.string().nullable().optional(),
    opta: z.string().nullable().optional(),
    funktion: z.string().nullable().optional(),
    hersteller: z.string().nullable().optional(),
    bedieneinheit: z.string().nullable().optional(),
    deviceModes: z.string().nullable().optional(),
    alamosIntegrated: z.boolean().nullable().optional(),
  })
  .strip();

// CSV import commit: column->index mapping (issi mandatory), raw rows, dryRun flag.
export const importCommitSchema = z.object({
  mapping: z
    .object({
      issi: z.number().int(),
      rufname: z.number().int().optional(),
      serialNumber: z.number().int().optional(),
      deviceType: z.number().int().optional(),
      status: z.number().int().optional(),
      location: z.number().int().optional(),
      assignedTo: z.number().int().optional(),
      softwareVersion: z.number().int().optional(),
      lastUpdatedAt: z.number().int().optional(),
      notes: z.number().int().optional(),
      hiorgId: z.number().int().optional(),
      opta: z.number().int().optional(),
      funktion: z.number().int().optional(),
      hersteller: z.number().int().optional(),
      bedieneinheit: z.number().int().optional(),
      deviceModes: z.number().int().optional(),
      alamosIntegrated: z.number().int().optional(),
    })
    .strip(),
  rows: z.array(z.array(z.string())),
  dryRun: z.boolean().default(false),
});

export type DeviceRecord = z.infer<typeof deviceRecordSchema>;
export type DeviceCreate = z.infer<typeof deviceCreateSchema>;
export type DevicePatch = z.infer<typeof devicePatchSchema>;
export type ImportCommit = z.infer<typeof importCommitSchema>;
export type SuggestionField = z.infer<typeof suggestionFieldEnum>;

// Shared CSV/diff type aliases (consumed by the later CSV phase); declared here
// so the public API is complete and importCommitSchema callers can type results.
export type FieldDiff = { field: string; oldValue: string | null; newValue: string | null };
export type ImportRowClass =
  | 'created'
  | 'updated'
  | 'unchanged'
  | 'error'
  | 'skipped-no-permission';
