export type UpdateStatus = 'aktuell' | 'veraltet' | 'unbekannt';

export function computeUpdateStatus(
  device: { softwareVersion: string | null },
  targetVersion: string | null,
): UpdateStatus {
  if (device.softwareVersion === null) return 'unbekannt';
  if (targetVersion !== null && device.softwareVersion === targetVersion) {
    return 'aktuell';
  }
  return 'veraltet';
}
