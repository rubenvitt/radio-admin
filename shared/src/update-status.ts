export type UpdateStatus = 'aktuell' | 'veraltet' | 'unbekannt';

export function computeUpdateStatus(
  device: { softwareVersion: string | null },
  referenceVersion: string | null,
): UpdateStatus {
  if (device.softwareVersion === null) return 'unbekannt';
  if (referenceVersion !== null && device.softwareVersion === referenceVersion) {
    return 'aktuell';
  }
  return 'veraltet';
}
