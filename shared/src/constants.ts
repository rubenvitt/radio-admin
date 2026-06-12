// Gerätefunktionen (device modes): the fixed canonical token set + order. The
// `deviceModes` device field stores a comma-joined subset of these in this order
// (e.g. "TMO,DMO"). The order here IS the canonical output order — do not sort.
export const DEVICE_MODES = ['TMO', 'DMO', 'REP', 'GAT'] as const;
export type DeviceMode = (typeof DEVICE_MODES)[number];

// The fixed status select options surfaced by the frontend. Export-only: the
// `status` field is NOT constrained to these values at the schema level (legacy
// / free-form values remain valid), this list just drives the UI select.
export const STATUS_OPTIONS = [
  'Einsatzbereit',
  'Defekt',
  'Ausgeliehen',
  'Wartung',
  'Sonstiges',
] as const;
export type StatusOption = (typeof STATUS_OPTIONS)[number];
