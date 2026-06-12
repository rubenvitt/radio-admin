// Device columns a CSV may target (no system/identity-internal fields).
export const IMPORTABLE_FIELDS = [
  'issi',
  'rufname',
  'serialNumber',
  'deviceType',
  'status',
  'location',
  'assignedTo',
  'softwareVersion',
  'lastUpdatedAt',
  'notes',
  'hiorgId',
  'opta',
  'funktion',
  'hersteller',
  'bedieneinheit',
  'deviceModes',
  'alamosIntegrated',
] as const;

export type ImportableField = (typeof IMPORTABLE_FIELDS)[number];

// Normalize a header: lowercase, strip accents, drop everything but [a-z0-9].
function norm(h: string): string {
  return h
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// Normalized synonym -> target field. Order matters for "first wins".
const SYNONYMS: Record<string, ImportableField> = {
  issi: 'issi',
  tei: 'issi',
  kennung: 'issi',
  funkrufnameissi: 'issi',
  rufname: 'rufname',
  funkrufname: 'rufname',
  seriennummer: 'serialNumber',
  seriennr: 'serialNumber',
  inventarnummer: 'serialNumber',
  serial: 'serialNumber',
  geraetetyp: 'deviceType',
  geraet: 'deviceType',
  // "Gerät" decomposes (NFD) to "gerat", not "geraet" — register both spellings.
  gerat: 'deviceType',
  typ: 'deviceType',
  modell: 'deviceType',
  status: 'status',
  zustand: 'status',
  standort: 'location',
  lagerort: 'location',
  ort: 'location',
  location: 'location',
  hiorgid: 'hiorgId',
  opta: 'opta',
  funktion: 'funktion',
  hersteller: 'hersteller',
  bedieneinheit: 'bedieneinheit',
  alamos: 'alamosIntegrated',
  alamosintegriert: 'alamosIntegrated',
  alamosintegration: 'alamosIntegrated',
  zuordnung: 'assignedTo',
  zugeordnet: 'assignedTo',
  zustaendig: 'assignedTo',
  assignedto: 'assignedTo',
  softwareversion: 'softwareVersion',
  swversion: 'softwareVersion',
  firmware: 'softwareVersion',
  fwversion: 'softwareVersion',
  version: 'softwareVersion',
  letztesupdate: 'softwareVersion',
  zuletztaktualisiert: 'lastUpdatedAt',
  updatedatum: 'lastUpdatedAt',
  aktualisiertam: 'lastUpdatedAt',
  notizen: 'notes',
  notiz: 'notes',
  bemerkung: 'notes',
  notes: 'notes',
};

/**
 * Maps raw CSV headers to device fields by normalized-name similarity.
 * Returns a record keyed by the ORIGINAL header string. Headers whose
 * normalized name matches no known synonym are omitted (left for manual
 * mapping in the UI). This does NOT dedup by target field: distinct headers
 * that share a synonym (e.g. "Typ" and "Gerätetyp" -> deviceType) all map to
 * that field. Resolving such collisions to a single source column is the
 * caller's responsibility — the synonym table is the source of truth here.
 */
export function autoMapHeaders(headers: string[]): Record<string, ImportableField> {
  const result: Record<string, ImportableField> = {};
  for (const raw of headers) {
    const n = norm(raw);
    // The "Gerätefunktionen-TMO/DMO/REP/GAT" header normalizes to a long token
    // (slashes/dashes stripped), so match it by prefix rather than exact name.
    // "ä" decomposes (NFD) to "a", so accept both the "gerate…" and "geraete…" forms.
    const isDeviceModes = n.startsWith('geratefunktionen') || n.startsWith('geraetefunktionen');
    const field = isDeviceModes ? 'deviceModes' : SYNONYMS[n];
    if (field) {
      result[raw] = field;
    }
  }
  return result;
}
