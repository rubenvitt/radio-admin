import { DEVICE_MODES, type DeviceMode } from '@ra/shared';

/**
 * Convert the canonical comma-joined `deviceModes` string (e.g. "TMO,DMO")
 * into an array of valid modes in canonical `DEVICE_MODES` order, for binding
 * to an antd multi-Select. Unknown/empty tokens are dropped.
 */
export function modesToArray(value: string | null | undefined): DeviceMode[] {
  if (!value) return [];
  const present = new Set(
    value
      .split(',')
      .map((token) => token.trim())
      .filter((token) => token !== ''),
  );
  return DEVICE_MODES.filter((mode) => present.has(mode));
}

/**
 * Convert an array of selected modes back into the canonical comma-joined
 * string (canonical `DEVICE_MODES` order, deduped). Returns null when empty so
 * it round-trips with the nullable `deviceModes` field.
 */
export function arrayToModes(modes: string[] | null | undefined): string | null {
  if (!modes || modes.length === 0) return null;
  const present = new Set(modes);
  const ordered = DEVICE_MODES.filter((mode) => present.has(mode));
  return ordered.length > 0 ? ordered.join(',') : null;
}
