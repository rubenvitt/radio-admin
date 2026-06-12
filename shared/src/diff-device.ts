import type { DeviceRecord, FieldDiff } from './schemas';

/** Stringify a stored device value for the event log; null/undefined -> null. */
function toEventValue(v: unknown): string | null {
  return v == null ? null : String(v);
}

/**
 * Compare an existing device against an incoming (already field-filtered) patch.
 * Iterates only the keys present in `patch`; emits one `FieldDiff` per field whose
 * value actually changed (raw `!==` comparison), with old/new stringified
 * (null preserved). Returns `[]` when nothing changed.
 */
export function diffDevice(existing: DeviceRecord, patch: Partial<DeviceRecord>): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  for (const field of Object.keys(patch) as (keyof DeviceRecord)[]) {
    const next = patch[field];
    if (next === undefined) continue;
    if (existing[field] === next) continue;
    diffs.push({
      field: field as string,
      oldValue: toEventValue(existing[field]),
      newValue: toEventValue(next),
    });
  }
  return diffs;
}
