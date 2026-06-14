# Geräteliste-Konfiguration & Update-Modus — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configurable device-list (columns, search fields, rich filter panel) plus a fast per-device "Update-Modus" with an append-only Update-Anmerkung for ISSI discrepancies.

**Architecture:** Server-side search/filter stays in `deviceRepo.listDevices` (whitelist-driven, never interpolating field names); a new append-only `updateNote` column with a dedicated `POST /api/devices/:id/update-note` endpoint enforces append semantics server-side. Client persists list config in localStorage (theme pattern). New `/update` page reuses the existing single-device `PATCH` + the append endpoint.

**Tech Stack:** TypeScript, Hono, Drizzle, better-sqlite3, Zod (`@ra/shared`); React 19, Ant Design 5, TanStack Query, React Router 7, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-14-geraeteliste-und-updater-design.md`

**Gates (run the direct binaries — the rtk hook masks exit codes; see CLAUDE.md):**
- Tests: `./node_modules/.bin/vitest run <path>`
- Typecheck: `./node_modules/.bin/tsc --noEmit -p shared/tsconfig.json && ./node_modules/.bin/tsc --noEmit -p server/tsconfig.json && ./node_modules/.bin/tsc --noEmit -p client/tsconfig.json`
- Lint (no `any`): `./node_modules/.bin/eslint .`
- Client build: `pnpm --filter @ra/client build`

Commit after every task. Commit messages end with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## Phase A — Datenmodell & Append-Endpunkt

### Task 1: `updateNote` column + migration + shared schemas

**Files:**
- Modify: `server/src/db/schema.ts:28-29` (devices table)
- Modify: `shared/src/schemas.ts` (record/create/patch schemas)
- Modify: `server/src/repos/deviceRepo.ts:33-34` (`createDevice` row literal)
- Create: `server/drizzle/000N_*.sql` + updated `server/drizzle/meta/*` (generated, do NOT hand-write)
- Test: `server/test/updateNote.repo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/test/updateNote.repo.test.ts
import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../src/db/test-utils';
import { createDevice, getDeviceById, updateDevice } from '../src/repos/deviceRepo';

describe('updateNote column', () => {
  it('persists updateNote on create and update', () => {
    const { db } = makeTestDb();
    const d = createDevice(db, { issi: '900', updateNote: '[2026-06-14 · A] erste Zeile' }, null);
    expect(getDeviceById(db, d.id)?.updateNote).toBe('[2026-06-14 · A] erste Zeile');

    updateDevice(db, d.id, { updateNote: '[2026-06-14 · A] erste Zeile\n[2026-06-14 · B] zweite' }, null);
    expect(getDeviceById(db, d.id)?.updateNote).toContain('zweite');
  });

  it('defaults updateNote to null when not provided', () => {
    const { db } = makeTestDb();
    const d = createDevice(db, { issi: '901' }, null);
    expect(getDeviceById(db, d.id)?.updateNote).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`updateNote` not in schema/types)

Run: `./node_modules/.bin/vitest run server/test/updateNote.repo.test.ts`
Expected: FAIL (type error / column missing).

- [ ] **Step 3: Add the DB column.** In `server/src/db/schema.ts`, inside the `devices` table after `loanable` (line 28) and before `createdAt`:

```ts
  // Append-only Update-Anmerkung (ISSI-Abweichungen etc.). Separate from the
  // admin master field `notes` — appended via POST /devices/:id/update-note,
  // never overwritten by the update flow. Admin may edit/clear it (resolve).
  updateNote: text('update_note'),
```

- [ ] **Step 4: Add to Zod schemas** in `shared/src/schemas.ts`:
  - In `deviceRecordSchema` (after `loanable`, line 38): `updateNote: z.string().nullable(),`
  - In `deviceCreateSchema` (after `loanable`, line 66): `updateNote: z.string().nullable().optional(),`
  - In `devicePatchSchema` (after `loanable`, line 90): `updateNote: z.string().nullable().optional(),`

- [ ] **Step 5: Persist in `createDevice`.** In `server/src/repos/deviceRepo.ts`, in the `row` literal after `loanable: input.loanable ?? null,` (line 33):

```ts
    updateNote: input.updateNote ?? null,
```

- [ ] **Step 6: Generate the migration** (append-only — never edit existing migrations):

Run: `cd server && node_modules/.bin/drizzle-kit generate && cd ..`
Expected: a new `server/drizzle/0009_*.sql` (next free number) with `ALTER TABLE devices ADD ...update_note...` and an updated `server/drizzle/meta/` snapshot. Verify no existing `*.sql` changed: `git status --porcelain server/drizzle` should show only ADDED files plus the `meta/_journal.json` + new snapshot.

- [ ] **Step 7: Run tests — expect PASS**

Run: `./node_modules/.bin/vitest run server/test/updateNote.repo.test.ts server/test/migrate.test.ts`
Expected: PASS.

- [ ] **Step 8: Typecheck shared + server, then commit**

Run: `./node_modules/.bin/tsc --noEmit -p shared/tsconfig.json && ./node_modules/.bin/tsc --noEmit -p server/tsconfig.json`

```bash
git add server/src/db/schema.ts shared/src/schemas.ts server/src/repos/deviceRepo.ts server/drizzle server/test/updateNote.repo.test.ts
git commit -m "feat(db): add append-only updateNote field to devices"
```

---

### Task 2: `appendUpdateNote` pure helper (shared)

**Files:**
- Create: `shared/src/update-note.ts`
- Modify: `shared/src/index.ts` (re-export)
- Test: `shared/src/update-note.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// shared/src/update-note.test.ts
import { describe, it, expect } from 'vitest';
import { appendUpdateNote } from './update-note';

const when = new Date('2026-06-14T10:00:00Z');

describe('appendUpdateNote', () => {
  it('creates the first line when existing is null/empty', () => {
    expect(appendUpdateNote(null, 'ISSI weicht ab: 999', 'Max', when)).toBe(
      '[2026-06-14 · Max] ISSI weicht ab: 999',
    );
    expect(appendUpdateNote('', 'x', 'Max', when)).toBe('[2026-06-14 · Max] x');
  });

  it('appends a new line, preserving existing content verbatim', () => {
    const existing = '[2026-06-01 · Eva] alt';
    expect(appendUpdateNote(existing, 'neu', 'Max', when)).toBe(
      '[2026-06-01 · Eva] alt\n[2026-06-14 · Max] neu',
    );
  });

  it('trims the new text but never the existing content', () => {
    expect(appendUpdateNote('  keep  ', '  spaces  ', 'Max', when)).toBe(
      '  keep  \n[2026-06-14 · Max] spaces',
    );
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (module missing)

Run: `./node_modules/.bin/vitest run shared/src/update-note.test.ts`

- [ ] **Step 3: Implement**

```ts
// shared/src/update-note.ts
/** Format a Date as YYYY-MM-DD in UTC (stable, locale-independent). */
function isoDate(when: Date): string {
  return when.toISOString().slice(0, 10);
}

/**
 * Append one timestamped, signed line to an Update-Anmerkung, never mutating
 * existing content. Returns the new full value. The new `text` is trimmed; the
 * existing value is preserved verbatim.
 */
export function appendUpdateNote(
  existing: string | null | undefined,
  text: string,
  author: string,
  when: Date,
): string {
  const line = `[${isoDate(when)} · ${author}] ${text.trim()}`;
  return existing && existing.length > 0 ? `${existing}\n${line}` : line;
}
```

- [ ] **Step 4: Re-export.** In `shared/src/index.ts` add: `export * from './update-note';`

- [ ] **Step 5: Run tests — expect PASS**

Run: `./node_modules/.bin/vitest run shared/src/update-note.test.ts`

- [ ] **Step 6: Typecheck + commit**

Run: `./node_modules/.bin/tsc --noEmit -p shared/tsconfig.json`

```bash
git add shared/src/update-note.ts shared/src/update-note.test.ts shared/src/index.ts
git commit -m "feat(shared): appendUpdateNote helper (append-only, signed line)"
```

---

### Task 3: `update-note` event source + append endpoint

**Files:**
- Modify: `server/src/db/schema.ts:79` (deviceEvents `source` enum)
- Modify: `server/src/repos/deviceRepo.ts:167` (`EventSource` type)
- Modify: `shared/src/schemas.ts` (add `updateNoteSchema`)
- Modify: `server/src/routes/devices.ts` (new route)
- Test: `server/test/devicesRoutes.updateNote.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/test/devicesRoutes.updateNote.test.ts
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../src/db/test-utils';
import { buildTestApp, authCookie, adminUser, updaterUser } from './helpers';
import { createDevice, getDeviceById } from '../src/repos/deviceRepo';
import { deviceEvents } from '../src/db/schema';

async function post(app: ReturnType<typeof buildTestApp>, id: string, user: Parameters<typeof authCookie>[0], body: unknown) {
  return app.request(`/api/devices/${id}/update-note`, {
    method: 'POST',
    headers: { Cookie: await authCookie(user), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/devices/:id/update-note', () => {
  it('updater appends a note without touching existing notes', async () => {
    const { db } = makeTestDb();
    const d = createDevice(db, { issi: '800', notes: 'STAMM-NOTIZ' }, null);
    const app = buildTestApp(db);

    const res = await post(app, d.id, updaterUser, { text: 'ISSI weicht ab: 999' });
    expect(res.status).toBe(200);

    const after = getDeviceById(db, d.id)!;
    expect(after.notes).toBe('STAMM-NOTIZ'); // untouched
    expect(after.updateNote).toContain('ISSI weicht ab: 999');
    expect(after.updateNote).toContain(`· ${updaterUser.name}]`);

    const events = db.select().from(deviceEvents).where(eq(deviceEvents.deviceId, d.id)).all();
    expect(events).toHaveLength(1);
    expect(events[0]?.field).toBe('updateNote');
    expect(events[0]?.source).toBe('update-note');
  });

  it('appends a second line, preserving the first', async () => {
    const { db } = makeTestDb();
    const d = createDevice(db, { issi: '801' }, null);
    const app = buildTestApp(db);
    await post(app, d.id, updaterUser, { text: 'erste' });
    await post(app, d.id, adminUser, { text: 'zweite' });
    const note = getDeviceById(db, d.id)!.updateNote!;
    expect(note.split('\n')).toHaveLength(2);
    expect(note).toContain('erste');
    expect(note).toContain('zweite');
  });

  it('400 on empty text, 404 on unknown id', async () => {
    const { db } = makeTestDb();
    const d = createDevice(db, { issi: '802' }, null);
    const app = buildTestApp(db);
    expect((await post(app, d.id, updaterUser, { text: '   ' })).status).toBe(400);
    expect((await post(app, 'nope', updaterUser, { text: 'x' })).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (route missing)

Run: `./node_modules/.bin/vitest run server/test/devicesRoutes.updateNote.test.ts`

- [ ] **Step 3: Extend the event source enum.** In `server/src/db/schema.ts:79`:

```ts
    source: text('source', { enum: ['manual', 'csv-import', 'create', 'update-note'] }).notNull(),
```

And in `server/src/repos/deviceRepo.ts:167`:

```ts
export type EventSource = 'manual' | 'csv-import' | 'create' | 'update-note';
```

- [ ] **Step 4: Add the request schema.** In `shared/src/schemas.ts` (after `devicePatchSchema`, ~line 92):

```ts
// Update-Anmerkung append payload: non-empty text (trimmed).
export const updateNoteSchema = z.object({
  text: z.string().trim().min(1),
});
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
```

- [ ] **Step 5: Add the route.** In `server/src/routes/devices.ts`, extend the `@ra/shared` import with `appendUpdateNote, updateNoteSchema` and add this route inside `deviceRoutes`, before `r.delete(...)`:

```ts
  // Append-only Update-Anmerkung. Open to any authenticated role (admin &
  // updater); append semantics are enforced server-side, never overwriting
  // `notes` or existing updateNote lines.
  r.post('/devices/:id/update-note', async (c) => {
    const id = c.req.param('id');
    const existing = getDeviceById(db, id);
    if (!existing) return c.json({ error: 'not_found' }, 404);

    const json = await c.req.json().catch(() => null);
    const parsed = updateNoteSchema.safeParse(json);
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);

    const user = c.get('user');
    const line = appendUpdateNote('', parsed.data.text, user.name, new Date());
    const nextNote = appendUpdateNote(existing.updateNote, parsed.data.text, user.name, new Date());

    const updated = db.transaction(() => {
      const u = updateDevice(db, id, { updateNote: nextNote }, user.sub)!;
      writeEvents(db, id, [{ field: 'updateNote', oldValue: existing.updateNote, newValue: line }], user.sub, 'update-note');
      return u;
    });

    const ref = getReferenceVersion(db);
    return c.json({ ...updated, updateStatus: computeUpdateStatus(updated, ref) });
  });
```

- [ ] **Step 6: Run tests — expect PASS**

Run: `./node_modules/.bin/vitest run server/test/devicesRoutes.updateNote.test.ts`

- [ ] **Step 7: Full server suite + typecheck (guard the enum change), then commit**

Run: `./node_modules/.bin/vitest run server/ && ./node_modules/.bin/tsc --noEmit -p server/tsconfig.json && ./node_modules/.bin/tsc --noEmit -p shared/tsconfig.json`

```bash
git add server/src/db/schema.ts server/src/repos/deviceRepo.ts shared/src/schemas.ts server/src/routes/devices.ts server/test/devicesRoutes.updateNote.test.ts
git commit -m "feat(api): POST /devices/:id/update-note append-only endpoint"
```

---

## Phase B — Liste

### Task 4: Server — configurable search fields (whitelist)

**Files:**
- Modify: `server/src/repos/deviceRepo.ts` (`SEARCHABLE_FIELDS`, `ListParams`, `listDevices`)
- Modify: `server/src/routes/devices.ts:44-52` (forward `searchFields`)
- Test: `server/test/deviceList.search.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/test/deviceList.search.test.ts
import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../src/db/test-utils';
import { createDevice, listDevices } from '../src/repos/deviceRepo';

function seed(db: ReturnType<typeof makeTestDb>['db']) {
  createDevice(db, { issi: '100', rufname: 'Alpha', funktion: 'Zugführer', opta: 'X-1' }, null);
  createDevice(db, { issi: '200', rufname: 'Bravo', funktion: 'Sanitäter', opta: 'Y-2' }, null);
}

describe('listDevices configurable search', () => {
  it('default search hits opta and funktion (not just the legacy 4 columns)', () => {
    const { db } = makeTestDb();
    seed(db);
    expect(listDevices(db, { q: 'Zugführer' }).rows.map((r) => r.issi)).toEqual(['100']);
    expect(listDevices(db, { q: 'Y-2' }).rows.map((r) => r.issi)).toEqual(['200']);
  });

  it('searchFields restricts the searched columns', () => {
    const { db } = makeTestDb();
    seed(db);
    // funktion excluded -> 'Zugführer' matches nothing
    expect(listDevices(db, { q: 'Zugführer', searchFields: 'rufname,issi' }).total).toBe(0);
    expect(listDevices(db, { q: 'Alpha', searchFields: 'rufname,issi' }).rows.map((r) => r.issi)).toEqual(['100']);
  });

  it('ignores unknown / non-whitelisted field names (never interpolated)', () => {
    const { db } = makeTestDb();
    seed(db);
    // bogus field is dropped; falls back to nothing-searched -> no crash, empty filter
    expect(() => listDevices(db, { q: 'Alpha', searchFields: 'evil; DROP TABLE devices' })).not.toThrow();
    expect(listDevices(db, { q: 'Alpha', searchFields: 'evil; DROP TABLE devices' }).total).toBe(0);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `./node_modules/.bin/vitest run server/test/deviceList.search.test.ts`

- [ ] **Step 3: Implement.** In `server/src/repos/deviceRepo.ts`:

Add a whitelist + helper near `SORTABLE` (after line 111):

```ts
/** Columns the free-text search may target. Field names map to columns here —
 *  NEVER interpolate a client-supplied name into SQL. */
const SEARCHABLE_FIELDS: Record<string, SQLiteColumn> = {
  rufname: devices.rufname,
  issi: devices.issi,
  serialNumber: devices.serialNumber,
  assignedTo: devices.assignedTo,
  opta: devices.opta,
  funktion: devices.funktion,
  deviceType: devices.deviceType,
  location: devices.location,
  hersteller: devices.hersteller,
  bedieneinheit: devices.bedieneinheit,
  hiorgId: devices.hiorgId,
};
const DEFAULT_SEARCH_FIELDS = ['rufname', 'issi', 'serialNumber', 'assignedTo', 'opta', 'funktion'];

/** Split a comma-separated query param into trimmed, non-empty tokens. */
function csv(v?: string): string[] {
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
}
```

Add `searchFields?: string;` to the `ListParams` interface (after `q?: string;`, line 85).

Replace the `if (params.q) { ... }` block (lines 125-134) with:

```ts
  if (params.q) {
    const term = `%${params.q}%`;
    const requested = csv(params.searchFields);
    const fields = (requested.length ? requested : DEFAULT_SEARCH_FIELDS)
      .map((f) => SEARCHABLE_FIELDS[f])
      .filter((col): col is SQLiteColumn => col != null);
    const orExpr = fields.length ? or(...fields.map((col) => like(col, term))) : undefined;
    if (orExpr) conds.push(orExpr);
  }
```

- [ ] **Step 4: Forward the param in the route.** In `server/src/routes/devices.ts`, in the `listDevices(db, { ... })` call (after `q: qp.q,`, line 45): add `searchFields: qp.searchFields,`.

- [ ] **Step 5: Run tests — expect PASS**

Run: `./node_modules/.bin/vitest run server/test/deviceList.search.test.ts server/test/deviceList.test.ts`

- [ ] **Step 6: Typecheck + commit**

Run: `./node_modules/.bin/tsc --noEmit -p server/tsconfig.json`

```bash
git add server/src/repos/deviceRepo.ts server/src/routes/devices.ts server/test/deviceList.search.test.ts
git commit -m "feat(api): whitelist-driven configurable search fields"
```

---

### Task 5: Server — new list filters

**Files:**
- Modify: `server/src/repos/deviceRepo.ts` (`ListParams`, `listDevices` conds)
- Modify: `server/src/routes/devices.ts` (forward params)
- Test: `server/test/deviceList.filters.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/test/deviceList.filters.test.ts
import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../src/db/test-utils';
import { createDevice, listDevices, updateDevice } from '../src/repos/deviceRepo';

function seed(db: ReturnType<typeof makeTestDb>['db']) {
  createDevice(db, { issi: '1', deviceType: 'MRT', hersteller: 'Motorola', funktion: 'Zugführer', status: 'Einsatzbereit', deviceModes: 'TMO,DMO', loanable: true, alamosIntegrated: true }, null);
  createDevice(db, { issi: '2', deviceType: 'HRT', hersteller: 'Sepura', funktion: 'Sanitäter', status: 'Wartung', deviceModes: 'TMO', loanable: false, alamosIntegrated: false }, null);
  const d3 = createDevice(db, { issi: '3', deviceType: 'MRT', hersteller: 'Motorola', status: 'Defekt' }, null);
  updateDevice(db, d3.id, { updateNote: '[2026-06-14 · A] Abweichung' }, null);
}

describe('listDevices filters', () => {
  it('filters by multi-value deviceType (IN) via CSV', () => {
    const { db } = makeTestDb(); seed(db);
    expect(listDevices(db, { deviceType: 'MRT' }).total).toBe(2);
    expect(listDevices(db, { deviceType: 'MRT,HRT' }).total).toBe(3);
  });
  it('filters by funktion, hersteller, status (multi)', () => {
    const { db } = makeTestDb(); seed(db);
    expect(listDevices(db, { funktion: 'Zugführer' }).rows.map((r) => r.issi)).toEqual(['1']);
    expect(listDevices(db, { hersteller: 'Motorola' }).total).toBe(2);
    expect(listDevices(db, { status: 'Wartung,Defekt' }).total).toBe(2);
  });
  it('filters by deviceModes token (AND across tokens)', () => {
    const { db } = makeTestDb(); seed(db);
    expect(listDevices(db, { deviceModes: 'DMO' }).rows.map((r) => r.issi)).toEqual(['1']);
    expect(listDevices(db, { deviceModes: 'TMO' }).total).toBe(2);
    expect(listDevices(db, { deviceModes: 'TMO,DMO' }).rows.map((r) => r.issi)).toEqual(['1']);
  });
  it('filters by loanable / alamosIntegrated / hasUpdateNote booleans', () => {
    const { db } = makeTestDb(); seed(db);
    expect(listDevices(db, { loanable: true }).rows.map((r) => r.issi)).toEqual(['1']);
    expect(listDevices(db, { alamosIntegrated: true }).rows.map((r) => r.issi)).toEqual(['1']);
    expect(listDevices(db, { hasUpdateNote: true }).rows.map((r) => r.issi)).toEqual(['3']);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `./node_modules/.bin/vitest run server/test/deviceList.filters.test.ts`

- [ ] **Step 3: Implement.** In `server/src/repos/deviceRepo.ts`:

Extend the imports on line 1 to include `inArray, isNotNull, ne`:

```ts
import { and, asc, count, desc, eq, inArray, isNotNull, like, ne, or, sql, type SQL } from 'drizzle-orm';
```

Extend `ListParams` (after `location?: string;`, line 87) with:

```ts
  deviceType?: string; // CSV -> IN
  funktion?: string; // CSV -> IN
  hersteller?: string; // CSV -> IN
  deviceModes?: string; // CSV tokens -> AND of LIKE
  loanable?: boolean;
  alamosIntegrated?: boolean;
  hasUpdateNote?: boolean;
```

In `listDevices`, replace the two single-value lines (`if (params.status) ...` and `if (params.location) ...`, lines 135-136) and add the new filters, so the categorical block reads:

```ts
  const inFilter = (col: SQLiteColumn, raw?: string) => {
    const values = csv(raw);
    if (values.length) conds.push(inArray(col, values));
  };
  inFilter(devices.status, params.status);
  inFilter(devices.location, params.location);
  inFilter(devices.deviceType, params.deviceType);
  inFilter(devices.funktion, params.funktion);
  inFilter(devices.hersteller, params.hersteller);
  for (const token of csv(params.deviceModes)) {
    conds.push(like(devices.deviceModes, `%${token}%`));
  }
  if (params.loanable) conds.push(eq(devices.loanable, true));
  if (params.alamosIntegrated) conds.push(eq(devices.alamosIntegrated, true));
  if (params.hasUpdateNote) conds.push(and(isNotNull(devices.updateNote), ne(devices.updateNote, '')) as SQL);
```

(Keep the existing `if (params.updateStatus) ...` line right after.)

- [ ] **Step 4: Forward params in the route.** In `server/src/routes/devices.ts`, in the `listDevices(db, {...})` call add after `location: qp.location,`:

```ts
      deviceType: qp.deviceType,
      funktion: qp.funktion,
      hersteller: qp.hersteller,
      deviceModes: qp.deviceModes,
      loanable: qp.loanable === '1',
      alamosIntegrated: qp.alamosIntegrated === '1',
      hasUpdateNote: qp.hasUpdateNote === '1',
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `./node_modules/.bin/vitest run server/test/deviceList.filters.test.ts server/test/deviceList.test.ts`

- [ ] **Step 6: Typecheck + lint + commit**

Run: `./node_modules/.bin/tsc --noEmit -p server/tsconfig.json && ./node_modules/.bin/eslint server`

```bash
git add server/src/repos/deviceRepo.ts server/src/routes/devices.ts server/test/deviceList.filters.test.ts
git commit -m "feat(api): list filters (deviceType/funktion/hersteller/modes/booleans/hasUpdateNote)"
```

---

### Task 6: Client — `usePersistentState` hook

**Files:**
- Create: `client/src/hooks/usePersistentState.ts`
- Test: `client/src/hooks/usePersistentState.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// client/src/hooks/usePersistentState.test.tsx
import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { usePersistentState } from './usePersistentState';

afterEach(() => localStorage.clear());

test('reads fallback, then persists and rehydrates', () => {
  const { result, unmount } = renderHook(() => usePersistentState<string[]>('ra-test', ['a']));
  expect(result.current[0]).toEqual(['a']);
  act(() => result.current[1](['a', 'b']));
  expect(JSON.parse(localStorage.getItem('ra-test')!)).toEqual(['a', 'b']);
  unmount();

  const second = renderHook(() => usePersistentState<string[]>('ra-test', ['a']));
  expect(second.result.current[0]).toEqual(['a', 'b']);
});

test('falls back on corrupt stored JSON', () => {
  localStorage.setItem('ra-bad', '{not json');
  const { result } = renderHook(() => usePersistentState('ra-bad', 42));
  expect(result.current[0]).toBe(42);
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `./node_modules/.bin/vitest run client/src/hooks/usePersistentState.test.tsx`

- [ ] **Step 3: Implement**

```ts
// client/src/hooks/usePersistentState.ts
import { useCallback, useState } from 'react';

/** useState mirrored to localStorage under `key`. Corrupt/missing values fall
 *  back to `fallback`. Mirrors the theme-persistence pattern (no backend). */
export function usePersistentState<T>(
  key: string,
  fallback: T,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw != null ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  });

  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // storage unavailable (private mode / quota) — keep in-memory value
      }
    },
    [key],
  );

  return [value, set];
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `./node_modules/.bin/vitest run client/src/hooks/usePersistentState.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/usePersistentState.ts client/src/hooks/usePersistentState.test.tsx
git commit -m "feat(client): usePersistentState (localStorage-backed)"
```

---

### Task 7: Client — `useDevices` params & query string

**Files:**
- Modify: `client/src/hooks/useDevices.ts`
- Test: `client/src/hooks/useDevices.test.tsx` (extend)

- [ ] **Step 1: Write the failing test** — append to `client/src/hooks/useDevices.test.tsx`:

```tsx
test('encodes searchFields and the new filters', async () => {
  const spy = vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ rows: [], total: 0, page: 1, pageSize: 20 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
  renderHook(
    () =>
      useDevices({
        page: 1,
        pageSize: 20,
        searchFields: ['issi', 'opta'],
        deviceType: ['MRT', 'HRT'],
        status: ['Wartung'],
        deviceModes: ['TMO'],
        loanable: true,
        hasUpdateNote: true,
      }),
    { wrapper },
  );
  await waitFor(() => expect(spy).toHaveBeenCalled());
  const url = spy.mock.calls[0]?.[0] as string;
  expect(url).toContain('searchFields=issi%2Copta');
  expect(url).toContain('deviceType=MRT%2CHRT');
  expect(url).toContain('status=Wartung');
  expect(url).toContain('deviceModes=TMO');
  expect(url).toContain('loanable=1');
  expect(url).toContain('hasUpdateNote=1');
});
```

(Add `renderHook` is already imported; `useDevices` import already present.)

- [ ] **Step 2: Run it — expect FAIL** (type errors / params not encoded)

Run: `./node_modules/.bin/vitest run client/src/hooks/useDevices.test.tsx`

- [ ] **Step 3: Implement.** Replace `DeviceListParams` and `toDeviceQueryString` in `client/src/hooks/useDevices.ts`:

```ts
export interface DeviceListParams {
  q?: string;
  searchFields?: string[];
  updateStatus?: UpdateStatus;
  status?: string[];
  location?: string[];
  deviceType?: string[];
  funktion?: string[];
  hersteller?: string[];
  deviceModes?: string[];
  loanable?: boolean;
  alamosIntegrated?: boolean;
  hasUpdateNote?: boolean;
  sort?: string;
  page: number;
  pageSize: number;
}

export function toDeviceQueryString(params: DeviceListParams): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  const csv = (key: string, arr?: string[]) => {
    if (arr && arr.length) sp.set(key, arr.join(','));
  };
  csv('searchFields', params.searchFields);
  csv('status', params.status);
  csv('location', params.location);
  csv('deviceType', params.deviceType);
  csv('funktion', params.funktion);
  csv('hersteller', params.hersteller);
  csv('deviceModes', params.deviceModes);
  if (params.updateStatus) sp.set('updateStatus', params.updateStatus);
  if (params.loanable) sp.set('loanable', '1');
  if (params.alamosIntegrated) sp.set('alamosIntegrated', '1');
  if (params.hasUpdateNote) sp.set('hasUpdateNote', '1');
  if (params.sort) sp.set('sort', params.sort);
  sp.set('page', String(params.page));
  sp.set('pageSize', String(params.pageSize));
  return sp.toString();
}
```

- [ ] **Step 4: Run tests — expect PASS** (both old and new test in the file)

Run: `./node_modules/.bin/vitest run client/src/hooks/useDevices.test.tsx`

- [ ] **Step 5: Commit the hook now.** Its tests pass. Note: a *repo-wide* `tsc` will still report errors in `DeviceList.tsx` / `DevicesPage.tsx` (they pass the old `status: string`), because those files are migrated in Tasks 8–9. That is expected mid-feature — the full client typecheck gate is green only at the end of Task 9. Commit just the hook:

```bash
git add client/src/hooks/useDevices.ts client/src/hooks/useDevices.test.tsx
git commit -m "feat(client): useDevices supports searchFields + new filters"
```

---

### Task 8: Client — list columns (Funktion + ⚠), column picker, search-field picker

**Files:**
- Create: `client/src/features/devices/deviceColumns.tsx` (column registry)
- Create: `client/src/features/devices/ColumnPicker.tsx`
- Create: `client/src/features/devices/SearchFieldPicker.tsx`
- Modify: `client/src/features/devices/DeviceList.tsx`
- Test: `client/src/features/devices/ColumnPicker.test.tsx`, `client/src/features/devices/DeviceList.columns.test.tsx`

- [ ] **Step 1: Create the column registry.** `client/src/features/devices/deviceColumns.tsx`:

```tsx
import type { ColumnsType } from 'antd/es/table';
import { FiAlertTriangle, FiCheck } from 'react-icons/fi';
import { Tooltip } from 'antd';
import { UpdateStatusBadge } from '../../components/UpdateStatusBadge';
import type { DeviceListItem } from '../../hooks/useDevices';

export interface ColumnDef {
  key: string;
  label: string; // shown in the column picker
  column: ColumnsType<DeviceListItem>[number];
}

/** All available list columns, keyed. The picker shows `label`; the table uses
 *  `column`. `key`/`dataIndex` must match the server sort whitelist for sortable
 *  columns (rufname/issi/status/location/softwareVersion/updateStatus). */
export const COLUMN_DEFS: ColumnDef[] = [
  { key: 'rufname', label: 'OPTA / Rufname', column: { title: 'OPTA / Rufname', key: 'rufname', sorter: true, render: (_, d) => d.opta || d.rufname || '—' } },
  { key: 'issi', label: 'ISSI', column: { title: 'ISSI', dataIndex: 'issi', key: 'issi', sorter: true } },
  { key: 'funktion', label: 'Funktion', column: { title: 'Funktion', dataIndex: 'funktion', key: 'funktion', render: (v: string | null) => v || '—' } },
  { key: 'deviceType', label: 'Gerät', column: { title: 'Gerät', dataIndex: 'deviceType', key: 'deviceType', render: (v: string | null) => v || '—' } },
  { key: 'updateStatus', label: 'Update-Stand', column: { title: 'Update-Stand', key: 'updateStatus', sorter: true, render: (_, d) => <UpdateStatusBadge status={d.updateStatus} /> } },
  { key: 'status', label: 'Status', column: { title: 'Status', dataIndex: 'status', key: 'status', sorter: true } },
  { key: 'location', label: 'Lagerort', column: { title: 'Lagerort', dataIndex: 'location', key: 'location', sorter: true } },
  { key: 'hasUpdateNote', label: '⚠ Abweichung', column: { title: <FiAlertTriangle aria-label="Abweichung gemeldet" />, key: 'hasUpdateNote', align: 'center', render: (_, d) => (d.updateNote ? <Tooltip title="Abweichung gemeldet"><span><FiAlertTriangle aria-label="Abweichung gemeldet" color="#d48806" /></span></Tooltip> : null) } },
  { key: 'hersteller', label: 'Hersteller', column: { title: 'Hersteller', dataIndex: 'hersteller', key: 'hersteller', render: (v: string | null) => v || '—' } },
  { key: 'bedieneinheit', label: 'Bedieneinheit', column: { title: 'Bedieneinheit', dataIndex: 'bedieneinheit', key: 'bedieneinheit', render: (v: string | null) => v || '—' } },
  { key: 'deviceModes', label: 'Gerätefunktionen', column: { title: 'Gerätefunktionen', dataIndex: 'deviceModes', key: 'deviceModes', render: (v: string | null) => v || '—' } },
  { key: 'assignedTo', label: 'Zuordnung', column: { title: 'Zuordnung', dataIndex: 'assignedTo', key: 'assignedTo', render: (v: string | null) => v || '—' } },
  { key: 'opta', label: 'OPTA', column: { title: 'OPTA', dataIndex: 'opta', key: 'opta', render: (v: string | null) => v || '—' } },
  { key: 'serialNumber', label: 'Seriennummer', column: { title: 'Seriennummer', dataIndex: 'serialNumber', key: 'serialNumber', render: (v: string | null) => v || '—' } },
  { key: 'loanable', label: 'Ausleihbar', column: { title: 'Ausleihbar', key: 'loanable', align: 'center', render: (_, d) => (d.loanable ? <FiCheck aria-label="Ausleihbar" /> : null) } },
  { key: 'alamosIntegrated', label: 'Alamos', column: { title: 'Alamos', key: 'alamosIntegrated', align: 'center', render: (_, d) => (d.alamosIntegrated ? <FiCheck aria-label="Alamos integriert" /> : null) } },
  { key: 'softwareVersion', label: 'Letztes Update', column: { title: 'Letztes Update', dataIndex: 'softwareVersion', key: 'softwareVersion', sorter: true, render: (v: string | null) => v || '—' } },
];

export const DEFAULT_VISIBLE_COLUMNS = [
  'rufname', 'issi', 'funktion', 'deviceType', 'updateStatus', 'status', 'location', 'hasUpdateNote',
];

/** Build the antd columns array from the persisted visible-key list, preserving
 *  COLUMN_DEFS order. Unknown stored keys are ignored. */
export function buildColumns(visibleKeys: string[]): ColumnsType<DeviceListItem> {
  const visible = new Set(visibleKeys);
  return COLUMN_DEFS.filter((d) => visible.has(d.key)).map((d) => d.column);
}
```

- [ ] **Step 2: Write the failing ColumnPicker test**

```tsx
// client/src/features/devices/ColumnPicker.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { ColumnPicker } from './ColumnPicker';

test('toggles a column key and calls onChange', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<ColumnPicker value={['rufname', 'issi']} onChange={onChange} />);
  await user.click(screen.getByRole('button', { name: /Spalten/i }));
  await user.click(await screen.findByText('Funktion'));
  expect(onChange).toHaveBeenCalledWith(expect.arrayContaining(['rufname', 'issi', 'funktion']));
});
```

- [ ] **Step 3: Implement `ColumnPicker`** `client/src/features/devices/ColumnPicker.tsx`:

```tsx
import { Button, Checkbox, Dropdown } from 'antd';
import { FiColumns } from 'react-icons/fi';
import { COLUMN_DEFS } from './deviceColumns';

export interface ColumnPickerProps {
  value: string[];
  onChange: (next: string[]) => void;
}

/** Dropdown of checkboxes toggling visible column keys (persisted by the parent). */
export function ColumnPicker({ value, onChange }: ColumnPickerProps) {
  const visible = new Set(value);
  const toggle = (key: string, checked: boolean) => {
    const next = new Set(visible);
    if (checked) next.add(key);
    else next.delete(key);
    onChange(COLUMN_DEFS.filter((d) => next.has(d.key)).map((d) => d.key));
  };
  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: COLUMN_DEFS.map((d) => ({
          key: d.key,
          label: (
            <Checkbox checked={visible.has(d.key)} onChange={(e) => toggle(d.key, e.target.checked)}>
              {d.label}
            </Checkbox>
          ),
        })),
      }}
    >
      <Button icon={<FiColumns />}>Spalten</Button>
    </Dropdown>
  );
}
```

- [ ] **Step 4: Implement `SearchFieldPicker`** `client/src/features/devices/SearchFieldPicker.tsx`:

```tsx
import { Button, Checkbox, Dropdown } from 'antd';
import { FiSliders } from 'react-icons/fi';

export const SEARCH_FIELD_OPTIONS: { key: string; label: string }[] = [
  { key: 'rufname', label: 'Rufname' },
  { key: 'issi', label: 'ISSI' },
  { key: 'serialNumber', label: 'Seriennummer' },
  { key: 'assignedTo', label: 'Zuordnung' },
  { key: 'opta', label: 'OPTA' },
  { key: 'funktion', label: 'Funktion' },
  { key: 'deviceType', label: 'Gerät' },
  { key: 'location', label: 'Lagerort' },
  { key: 'hersteller', label: 'Hersteller' },
  { key: 'bedieneinheit', label: 'Bedieneinheit' },
  { key: 'hiorgId', label: 'Hiorg-ID' },
];

export const DEFAULT_SEARCH_FIELDS = ['rufname', 'issi', 'serialNumber', 'assignedTo', 'opta', 'funktion'];

export interface SearchFieldPickerProps {
  value: string[];
  onChange: (next: string[]) => void;
}

export function SearchFieldPicker({ value, onChange }: SearchFieldPickerProps) {
  const selected = new Set(value);
  const toggle = (key: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(key);
    else next.delete(key);
    onChange(SEARCH_FIELD_OPTIONS.filter((o) => next.has(o.key)).map((o) => o.key));
  };
  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: SEARCH_FIELD_OPTIONS.map((o) => ({
          key: o.key,
          label: (
            <Checkbox checked={selected.has(o.key)} onChange={(e) => toggle(o.key, e.target.checked)}>
              {o.label}
            </Checkbox>
          ),
        })),
      }}
    >
      <Button icon={<FiSliders />} aria-label="Suchfelder" />
    </Dropdown>
  );
}
```

- [ ] **Step 5: Wire into `DeviceList.tsx`.** Replace the `columns` useMemo (lines 80-117) and the toolbar's search block. Concretely:
  - Add imports: `import { ColumnPicker } from './ColumnPicker'; import { SearchFieldPicker, DEFAULT_SEARCH_FIELDS } from './SearchFieldPicker'; import { buildColumns, DEFAULT_VISIBLE_COLUMNS } from './deviceColumns'; import { usePersistentState } from '../../hooks/usePersistentState';`
  - Remove the now-unused `ColumnsType`, `FiCheck`, `UpdateStatusBadge`, `useMemo` imports that moved into `deviceColumns.tsx` (keep what's still used; let eslint/tsc guide removal).
  - Add state near the other hooks:

```tsx
  const [visibleColumns, setVisibleColumns] = usePersistentState<string[]>(
    'ra-device-columns', DEFAULT_VISIBLE_COLUMNS,
  );
  const [searchFields, setSearchFields] = usePersistentState<string[]>(
    'ra-device-search-fields', DEFAULT_SEARCH_FIELDS,
  );
  const columns = useMemo(() => buildColumns(visibleColumns), [visibleColumns]);
```

  - Feed `searchFields` into the params debounce effect by adding it to the `setParams` update and the effect dependency list:

```tsx
  useEffect(() => {
    const handle = setTimeout(() => {
      setParams((prev) => {
        const next = search.trim() || undefined;
        if (prev.q === next && prev.searchFields === searchFields) return prev;
        return { ...prev, q: next, searchFields, page: 1 };
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [search, searchFields]);
```

  - In the toolbar, wrap the search input with the picker and add the column picker to the right group:

```tsx
        <Space.Compact style={{ width: 360, maxWidth: '100%' }}>
          <Input.Search
            allowClear
            placeholder="Suche…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <SearchFieldPicker value={searchFields} onChange={setSearchFields} />
        </Space.Compact>
```
  and in the right-hand `Space`, before the admin buttons: `<ColumnPicker value={visibleColumns} onChange={setVisibleColumns} />` (the ColumnPicker is visible to all roles — move it out of the `isAdmin` block).

- [ ] **Step 6: Write the list columns test** `client/src/features/devices/DeviceList.columns.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { DeviceList } from './DeviceList';

vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ isAdmin: false }) }));

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        rows: [{ id: '1', issi: '1001', funktion: 'Zugführer', deviceType: 'MRT', updateStatus: 'veraltet', updateNote: '[x] abweichung' }],
        total: 1, page: 1, pageSize: 20,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );
});
afterEach(() => vi.restoreAllMocks());

function renderList() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DeviceList /></MemoryRouter>
    </QueryClientProvider>,
  );
}

test('shows the Funktion column value and the Abweichung marker by default', async () => {
  renderList();
  expect(await screen.findByText('Zugführer')).toBeInTheDocument();
  await waitFor(() => expect(screen.getAllByLabelText('Abweichung gemeldet').length).toBeGreaterThan(0));
});
```

- [ ] **Step 7: Run tests — expect PASS**

Run: `./node_modules/.bin/vitest run client/src/features/devices/ColumnPicker.test.tsx client/src/features/devices/DeviceList.columns.test.tsx client/src/features/devices/DeviceList.test.tsx`

- [ ] **Step 8: Commit** (typecheck still has known status/location errors fixed in Task 9 — that's expected)

```bash
git add client/src/features/devices/deviceColumns.tsx client/src/features/devices/ColumnPicker.tsx client/src/features/devices/SearchFieldPicker.tsx client/src/features/devices/DeviceList.tsx client/src/features/devices/ColumnPicker.test.tsx client/src/features/devices/DeviceList.columns.test.tsx
git commit -m "feat(client): list column picker, Funktion + Abweichung columns, search-field picker"
```

---

### Task 9: Client — filter drawer + DevicesPage seeding

**Files:**
- Create: `client/src/features/devices/DeviceFilterDrawer.tsx`
- Modify: `client/src/features/devices/DeviceList.tsx` (filter button + drawer, remove the standalone Status select)
- Modify: `client/src/pages/DevicesPage.tsx` (seed new array params)
- Test: `client/src/features/devices/DeviceFilterDrawer.test.tsx`

- [ ] **Step 1: Implement `DeviceFilterDrawer`** `client/src/features/devices/DeviceFilterDrawer.tsx`:

```tsx
import { Button, Drawer, Form, Select, Space, Switch } from 'antd';
import { DEVICE_MODES, STATUS_OPTIONS, type UpdateStatus } from '@ra/shared';
import { useSuggestions, type SuggestionField } from '../../hooks/useSuggestions';
import type { DeviceListParams } from '../../hooks/useDevices';

export type DeviceFilters = Pick<
  DeviceListParams,
  'updateStatus' | 'status' | 'location' | 'deviceType' | 'funktion' | 'hersteller' | 'deviceModes' | 'loanable' | 'alamosIntegrated' | 'hasUpdateNote'
>;

export const EMPTY_FILTERS: DeviceFilters = {};

/** Count of active filters — drives the toolbar Badge. */
export function countActiveFilters(f: DeviceFilters): number {
  let n = 0;
  if (f.updateStatus) n++;
  for (const arr of [f.status, f.location, f.deviceType, f.funktion, f.hersteller, f.deviceModes]) {
    if (arr && arr.length) n++;
  }
  if (f.loanable) n++;
  if (f.alamosIntegrated) n++;
  if (f.hasUpdateNote) n++;
  return n;
}

const UPDATE_STATUS_OPTIONS: { value: UpdateStatus; label: string }[] = [
  { value: 'aktuell', label: 'Aktuell' },
  { value: 'veraltet', label: 'Veraltet' },
  { value: 'unbekannt', label: 'Unbekannt' },
];

function SuggestSelect({ field, value, onChange, placeholder }: { field: SuggestionField; value?: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const { data, isLoading } = useSuggestions(field);
  return (
    <Select
      mode="multiple" allowClear loading={isLoading} placeholder={placeholder}
      value={value} onChange={onChange} style={{ width: '100%' }}
      options={(data ?? []).map((v) => ({ label: v, value: v }))}
    />
  );
}

export interface DeviceFilterDrawerProps {
  open: boolean;
  value: DeviceFilters;
  onClose: () => void;
  onApply: (next: DeviceFilters) => void;
}

export function DeviceFilterDrawer({ open, value, onClose, onApply }: DeviceFilterDrawerProps) {
  const [form] = Form.useForm<DeviceFilters>();
  return (
    <Drawer
      title="Filter" open={open} onClose={onClose} width={360} destroyOnHidden
      extra={
        <Space>
          <Button onClick={() => { form.resetFields(); onApply(EMPTY_FILTERS); }}>Zurücksetzen</Button>
          <Button type="primary" onClick={() => onApply(form.getFieldsValue())}>Anwenden</Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" initialValues={value}>
        <Form.Item name="deviceType" label="Gerät"><SuggestSelect field="deviceType" placeholder="Alle" onChange={(v) => form.setFieldValue('deviceType', v)} value={form.getFieldValue('deviceType')} /></Form.Item>
        <Form.Item name="funktion" label="Funktion"><SuggestSelect field="funktion" placeholder="Alle" onChange={(v) => form.setFieldValue('funktion', v)} value={form.getFieldValue('funktion')} /></Form.Item>
        <Form.Item name="status" label="Status">
          <Select mode="multiple" allowClear placeholder="Alle" options={STATUS_OPTIONS.map((s) => ({ label: s, value: s }))} />
        </Form.Item>
        <Form.Item name="updateStatus" label="Update-Stand">
          <Select allowClear placeholder="Alle" options={UPDATE_STATUS_OPTIONS} />
        </Form.Item>
        <Form.Item name="location" label="Lagerort"><SuggestSelect field="location" placeholder="Alle" onChange={(v) => form.setFieldValue('location', v)} value={form.getFieldValue('location')} /></Form.Item>
        <Form.Item name="hersteller" label="Hersteller"><SuggestSelect field="hersteller" placeholder="Alle" onChange={(v) => form.setFieldValue('hersteller', v)} value={form.getFieldValue('hersteller')} /></Form.Item>
        <Form.Item name="deviceModes" label="Gerätefunktionen">
          <Select mode="multiple" allowClear placeholder="Alle" options={DEVICE_MODES.map((m) => ({ label: m, value: m }))} />
        </Form.Item>
        <Form.Item name="loanable" label="Ausleihbar" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name="alamosIntegrated" label="Alamos integriert" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name="hasUpdateNote" label="Abweichung gemeldet" valuePropName="checked"><Switch /></Form.Item>
      </Form>
    </Drawer>
  );
}
```

> Note: the `SuggestSelect` wrapper reads/writes through `form.setFieldValue` because a custom child inside `Form.Item` needs explicit value plumbing; the plain antd `Select` items (`status`, `deviceModes`, `updateStatus`) bind automatically via `Form.Item name`.

- [ ] **Step 2: Wire into `DeviceList.tsx`:**
  - Import: `import { Badge } from 'antd'; import { FiFilter } from 'react-icons/fi'; import { DeviceFilterDrawer, EMPTY_FILTERS, countActiveFilters, type DeviceFilters } from './DeviceFilterDrawer';`
  - Remove the standalone Status `Select` (old lines 158-167) and the `UPDATE_STATUS_OPTIONS`/`STATUS_OPTIONS`-based selects from the toolbar (the Update-Stand quick select may stay OR move into the panel; per spec keep a quick Update-Stand select is optional — move both into the panel for a single source of truth). Remove the now-unused `STATUS_OPTIONS` import if no longer used.
  - Add state: `const [filterOpen, setFilterOpen] = useState(false); const [filters, setFilters] = useState<DeviceFilters>(() => ({ updateStatus: initialParams?.updateStatus, status: initialParams?.status, location: initialParams?.location, deviceType: initialParams?.deviceType }));`
  - Push filters into `params` whenever they change. Map **every** filter key explicitly (not a spread) so that clearing a filter actually removes it from `params`:

```tsx
  useEffect(() => {
    setParams((prev) => ({
      ...prev,
      updateStatus: filters.updateStatus,
      status: filters.status,
      location: filters.location,
      deviceType: filters.deviceType,
      funktion: filters.funktion,
      hersteller: filters.hersteller,
      deviceModes: filters.deviceModes,
      loanable: filters.loanable,
      alamosIntegrated: filters.alamosIntegrated,
      hasUpdateNote: filters.hasUpdateNote,
      page: 1,
    }));
  }, [filters]);
```

  - Toolbar left group, after the search compact: a filter button with a count badge:

```tsx
        <Badge count={countActiveFilters(filters)} size="small">
          <Button icon={<FiFilter />} onClick={() => setFilterOpen(true)}>Filter</Button>
        </Badge>
```

  - Before the closing tag of the component, render the drawer:

```tsx
      <DeviceFilterDrawer
        open={filterOpen}
        value={filters}
        onClose={() => setFilterOpen(false)}
        onApply={(next) => { setFilters(next); setFilterOpen(false); }}
      />
```

- [ ] **Step 3: Seed new array params in `DevicesPage.tsx`.** Replace the `initialParams` object passed to `<DeviceList>` so single URL values become arrays:

```tsx
      <DeviceList
        key={searchParams.toString()}
        initialParams={{
          updateStatus,
          q,
          status: status ? [status] : undefined,
          location: location ? [location] : undefined,
        }}
      />
```

- [ ] **Step 4: Write the filter drawer test** `client/src/features/devices/DeviceFilterDrawer.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi, beforeEach, afterEach } from 'vitest';
import { DeviceFilterDrawer, countActiveFilters } from './DeviceFilterDrawer';

beforeEach(() => {
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ values: ['MRT', 'HRT'] }), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
});
afterEach(() => vi.restoreAllMocks());

test('countActiveFilters counts arrays, booleans and single values', () => {
  expect(countActiveFilters({})).toBe(0);
  expect(countActiveFilters({ deviceType: ['MRT'], loanable: true, updateStatus: 'veraltet' })).toBe(3);
});

test('Anwenden emits the chosen status filter', async () => {
  const user = userEvent.setup();
  const onApply = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DeviceFilterDrawer open value={{}} onClose={() => {}} onApply={onApply} />
    </QueryClientProvider>,
  );
  // open the Status select and pick "Wartung"
  await user.click(screen.getByLabelText('Status'));
  await user.click(await screen.findByText('Wartung'));
  await user.click(screen.getByRole('button', { name: 'Anwenden' }));
  expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ status: ['Wartung'] }));
});
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `./node_modules/.bin/vitest run client/src/features/devices/DeviceFilterDrawer.test.tsx client/src/features/devices/DeviceList.test.tsx client/src/features/devices/DeviceList.columns.test.tsx`

- [ ] **Step 6: Full client typecheck + lint + build — expect PASS now**

Run: `./node_modules/.bin/tsc --noEmit -p client/tsconfig.json && ./node_modules/.bin/eslint client && pnpm --filter @ra/client build`

- [ ] **Step 7: Commit**

```bash
git add client/src/features/devices/DeviceFilterDrawer.tsx client/src/features/devices/DeviceList.tsx client/src/pages/DevicesPage.tsx client/src/features/devices/DeviceFilterDrawer.test.tsx
git commit -m "feat(client): filter drawer with active-count badge + URL seeding"
```

---

### Task 10: Client — mobile card extra fields

**Files:**
- Modify: `client/src/features/devices/DeviceList.tsx` (mobile `List` `renderItem`)
- Test: `client/src/features/devices/DeviceList.mobile.test.tsx`

- [ ] **Step 1: Write the failing test** (force the mobile branch by stubbing `Grid.useBreakpoint`):

```tsx
// client/src/features/devices/DeviceList.mobile.test.tsx
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ isAdmin: false }) }));
vi.mock('antd', async (importOriginal) => {
  const antd = await importOriginal<typeof import('antd')>();
  return { ...antd, Grid: { ...antd.Grid, useBreakpoint: () => ({ md: false }) } };
});

import { DeviceList } from './DeviceList';

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({ rows: [{ id: '1', issi: '1001', rufname: 'Alpha', funktion: 'Zugführer', deviceType: 'MRT', updateStatus: 'veraltet', updateNote: '[x] y' }], total: 1, page: 1, pageSize: 20 }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );
});
afterEach(() => vi.restoreAllMocks());

test('mobile card shows Funktion and the Abweichung marker', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DeviceList /></MemoryRouter>
    </QueryClientProvider>,
  );
  expect(await screen.findByText(/Zugführer/)).toBeInTheDocument();
  expect(screen.getByLabelText('Abweichung gemeldet')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `./node_modules/.bin/vitest run client/src/features/devices/DeviceList.mobile.test.tsx`

- [ ] **Step 3: Implement.** In the mobile `renderItem` `Card` body (around lines 223-232), add the Funktion / Gerät line and the marker. Add `FiAlertTriangle` to the `react-icons/fi` import. Inside the inner `Space direction="vertical"`, after the ISSI text:

```tsx
                  {(device.funktion || device.deviceType) && (
                    <Typography.Text type="secondary">
                      {[device.funktion, device.deviceType].filter(Boolean).join(' · ')}
                    </Typography.Text>
                  )}
                  <Space size={4} wrap>
                    {device.location && <Tag>{device.location}</Tag>}
                    {device.updateNote && (
                      <Tag color="warning" icon={<FiAlertTriangle aria-label="Abweichung gemeldet" />}>
                        Abweichung
                      </Tag>
                    )}
                  </Space>
```

(Replace the existing `{device.location && <Tag>{device.location}</Tag>}` line with the `Space` block above.)

- [ ] **Step 4: Run tests — expect PASS**

Run: `./node_modules/.bin/vitest run client/src/features/devices/DeviceList.mobile.test.tsx`

- [ ] **Step 5: Typecheck + commit**

Run: `./node_modules/.bin/tsc --noEmit -p client/tsconfig.json`

```bash
git add client/src/features/devices/DeviceList.tsx client/src/features/devices/DeviceList.mobile.test.tsx
git commit -m "feat(client): mobile cards show Funktion/Gerät + Abweichung tag"
```

---

## Phase C — Update-Modus & Drawer-Anmerkung

### Task 11: Client — `useUpdateNote` hook

**Files:**
- Create: `client/src/hooks/useUpdateNote.ts`
- Test: `client/src/hooks/useUpdateNote.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// client/src/hooks/useUpdateNote.test.tsx
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, test, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useUpdateNote } from './useUpdateNote';

afterEach(() => vi.restoreAllMocks());
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

test('POSTs the note text to the append endpoint', async () => {
  const spy = vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ id: 'd1', updateNote: '[x] y' }), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
  const { result } = renderHook(() => useUpdateNote('d1'), { wrapper });
  await result.current.mutateAsync('ISSI weicht ab');
  await waitFor(() => expect(spy).toHaveBeenCalled());
  const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
  expect(url).toBe('/api/devices/d1/update-note');
  expect(opts.method).toBe('POST');
  expect(JSON.parse(opts.body as string)).toEqual({ text: 'ISSI weicht ab' });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `./node_modules/.bin/vitest run client/src/hooks/useUpdateNote.test.tsx`

- [ ] **Step 3: Implement**

```ts
// client/src/hooks/useUpdateNote.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import type { DeviceListItem } from './useDevices';

/** Append an Update-Anmerkung line to a device (append-only on the server). */
export function useUpdateNote(id: string) {
  const queryClient = useQueryClient();
  return useMutation<DeviceListItem, Error, string>({
    mutationFn: (text) =>
      apiFetch<DeviceListItem>(`/api/devices/${id}/update-note`, {
        method: 'POST',
        body: { text },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['device', id] });
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `./node_modules/.bin/vitest run client/src/hooks/useUpdateNote.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/useUpdateNote.ts client/src/hooks/useUpdateNote.test.tsx
git commit -m "feat(client): useUpdateNote append hook"
```

---

### Task 12: Client — Update-Modus page (route, nav, search, one-tap apply, progress)

**Files:**
- Create: `client/src/features/update/UpdateDeviceCard.tsx`
- Create: `client/src/features/update/UpdateMode.tsx`
- Create: `client/src/pages/UpdatePage.tsx`
- Modify: `client/src/routes/router.tsx` (route)
- Modify: `client/src/layout/AppLayout.tsx` (nav item)
- Test: `client/src/features/update/UpdateDeviceCard.test.tsx`

- [ ] **Step 1: Implement `UpdateDeviceCard`** `client/src/features/update/UpdateDeviceCard.tsx`:

```tsx
import { useState } from 'react';
import { Button, Card, Input, Space, Typography, message } from 'antd';
import { FiAlertTriangle, FiCheck } from 'react-icons/fi';
import { UpdateStatusBadge } from '../../components/UpdateStatusBadge';
import { useUpdateDevice } from '../../hooks/useUpdateDevice';
import { useUpdateNote } from '../../hooks/useUpdateNote';
import type { DeviceListItem } from '../../hooks/useDevices';

export interface UpdateDeviceCardProps {
  device: DeviceListItem;
  targetVersion: string;
}

/** One device row in the Update-Modus: one-tap "set to target version" + an
 *  optional Update-Anmerkung (ISSI discrepancy). Each card owns its mutations. */
export function UpdateDeviceCard({ device, targetVersion }: UpdateDeviceCardProps) {
  const update = useUpdateDevice(device.id);
  const note = useUpdateNote(device.id);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');

  const apply = async () => {
    try {
      await update.mutateAsync({ softwareVersion: targetVersion, lastUpdatedAt: Date.now() });
      message.success(`${device.rufname || device.opta || device.issi}: auf ${targetVersion} gesetzt`);
    } catch {
      message.error('Speichern fehlgeschlagen');
    }
  };

  const submitNote = async () => {
    if (!noteText.trim()) return;
    try {
      await note.mutateAsync(noteText.trim());
      message.success('Anmerkung gespeichert');
      setNoteText('');
      setNoteOpen(false);
    } catch {
      message.error('Anmerkung fehlgeschlagen');
    }
  };

  return (
    <Card size="small" style={{ width: '100%' }}>
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Space style={{ justifyContent: 'space-between', width: '100%' }} wrap>
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{device.rufname || device.opta || device.issi}</Typography.Text>
            <Typography.Text type="secondary">
              ISSI {device.issi}{device.funktion ? ` · ${device.funktion}` : ''}{device.deviceType ? ` · ${device.deviceType}` : ''}
            </Typography.Text>
          </Space>
          <UpdateStatusBadge status={device.updateStatus} />
        </Space>
        <Space wrap>
          <Button type="primary" icon={<FiCheck />} loading={update.isPending} disabled={!targetVersion} onClick={apply}>
            Auf {targetVersion || '—'} aktualisiert
          </Button>
          <Button icon={<FiAlertTriangle />} onClick={() => setNoteOpen((o) => !o)}>
            ISSI weicht ab / Anmerkung
          </Button>
        </Space>
        {noteOpen && (
          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder="z. B. echte ISSI am Gerät / Abweichung"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onPressEnter={submitNote}
            />
            <Button onClick={submitNote} loading={note.isPending}>Speichern</Button>
          </Space.Compact>
        )}
        {device.updateNote && (
          <Typography.Paragraph type="warning" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
            {device.updateNote}
          </Typography.Paragraph>
        )}
      </Space>
    </Card>
  );
}
```

- [ ] **Step 2: Implement `UpdateMode`** `client/src/features/update/UpdateMode.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Alert, Empty, Input, Progress, Space, Spin, Typography } from 'antd';
import { Combobox } from '../../components/Combobox';
import { useSoftwareVersions } from '../../hooks/useSoftwareVersions';
import { useDevices } from '../../hooks/useDevices';
import { UpdateDeviceCard } from './UpdateDeviceCard';

const SEARCH_FIELDS = ['issi', 'rufname', 'opta'];

export function UpdateMode() {
  const versions = useSoftwareVersions();
  const [target, setTarget] = useState<string>('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState<string | undefined>(undefined);

  // Preselect the current reference version once it loads.
  useEffect(() => {
    if (!target) {
      const ref = versions.data?.find((v) => v.reference)?.value;
      if (ref) setTarget(ref);
    }
  }, [versions.data, target]);

  useEffect(() => {
    const h = setTimeout(() => setQ(search.trim() || undefined), 300);
    return () => clearTimeout(h);
  }, [search]);

  const results = useDevices({ q, searchFields: SEARCH_FIELDS, page: 1, pageSize: 25 });
  const totalAll = useDevices({ page: 1, pageSize: 1 });
  const onTarget = useDevices({ updateStatus: 'aktuell', page: 1, pageSize: 1 });
  const total = totalAll.data?.total ?? 0;
  const done = onTarget.data?.total ?? 0;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%', maxWidth: 720 }}>
      <Typography.Title level={3} style={{ marginBottom: 0 }}>Update-Modus</Typography.Title>
      <Alert
        type="info" showIcon
        message="Gerät suchen, mit einem Tap auf die Zielversion setzen. Nur die Geräte, die du wirklich aktualisiert hast."
      />
      <div>
        <Typography.Text strong>Zielversion</Typography.Text>
        <Combobox
          allowCreate
          options={(versions.data ?? []).map((v) => v.value)}
          loading={versions.isLoading}
          value={target}
          onChange={(v) => setTarget(v ?? '')}
          placeholder="Zielversion wählen oder anlegen"
        />
      </div>
      {total > 0 && (
        <div>
          <Typography.Text type="secondary">{done} von {total} auf Zielversion</Typography.Text>
          <Progress percent={Math.round((done / total) * 100)} />
        </div>
      )}
      <Input.Search
        allowClear
        placeholder="ISSI / Rufname / OPTA suchen…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {results.isFetching ? (
        <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
      ) : !q ? (
        <Empty description="Gerät suchen, um es zu aktualisieren" />
      ) : results.data && results.data.rows.length > 0 ? (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {results.data.rows.map((d) => (
            <UpdateDeviceCard key={d.id} device={d} targetVersion={target} />
          ))}
        </Space>
      ) : (
        <Empty description="Kein Gerät gefunden" />
      )}
    </Space>
  );
}
```

> Verify `Combobox` accepts `value`/`onChange` props (it forwards `id`/`aria-label` per the exploration). If its prop names differ, adapt the two `Combobox` usages here and in `DeviceFields.tsx` accordingly — read `client/src/components/Combobox.tsx` first.

- [ ] **Step 3: Thin page + route + nav.**
  - `client/src/pages/UpdatePage.tsx`:

```tsx
import { UpdateMode } from '../features/update/UpdateMode';

export function UpdatePage() {
  return <UpdateMode />;
}
```
  - In `client/src/routes/router.tsx`: import `import { UpdatePage } from '../pages/UpdatePage';` and add inside the children array (after `/devices/:id`): `{ path: '/update', element: <UpdatePage /> },`
  - In `client/src/layout/AppLayout.tsx`: add `FiRefreshCw` to the `react-icons/fi` import and a nav item after Geräte: `{ key: '/update', label: 'Update-Modus', icon: <FiRefreshCw /> },` (no `adminOnly` — both roles).

- [ ] **Step 4: Write the card test** `client/src/features/update/UpdateDeviceCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { UpdateDeviceCard } from './UpdateDeviceCard';
import type { DeviceListItem } from '../../hooks/useDevices';

const device = { id: 'd1', issi: '1001', rufname: 'Alpha', funktion: 'Zugführer', deviceType: 'MRT', updateStatus: 'veraltet', updateNote: null } as unknown as DeviceListItem;

beforeEach(() => {
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ id: 'd1', updateStatus: 'aktuell' }), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
});
afterEach(() => vi.restoreAllMocks());

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><UpdateDeviceCard device={device} targetVersion="v2.4.1" /></QueryClientProvider>);
}

test('one-tap apply PATCHes softwareVersion + lastUpdatedAt', async () => {
  const user = userEvent.setup();
  renderCard();
  await user.click(screen.getByRole('button', { name: /Auf v2.4.1 aktualisiert/i }));
  const calls = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
  const patch = calls.find(([url, o]) => url === '/api/devices/d1' && o.method === 'PATCH');
  expect(patch).toBeTruthy();
  const body = JSON.parse(patch![1].body as string);
  expect(body.softwareVersion).toBe('v2.4.1');
  expect(typeof body.lastUpdatedAt).toBe('number');
});

test('note expander posts to the append endpoint', async () => {
  const user = userEvent.setup();
  renderCard();
  await user.click(screen.getByRole('button', { name: /ISSI weicht ab/i }));
  await user.type(screen.getByPlaceholderText(/echte ISSI/i), 'ISSI 999');
  await user.click(screen.getByRole('button', { name: 'Speichern' }));
  const calls = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
  expect(calls.some(([url]) => url === '/api/devices/d1/update-note')).toBe(true);
});
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `./node_modules/.bin/vitest run client/src/features/update/UpdateDeviceCard.test.tsx`

- [ ] **Step 6: Typecheck + lint + build, then commit**

Run: `./node_modules/.bin/tsc --noEmit -p client/tsconfig.json && ./node_modules/.bin/eslint client && pnpm --filter @ra/client build`

```bash
git add client/src/features/update client/src/pages/UpdatePage.tsx client/src/routes/router.tsx client/src/layout/AppLayout.tsx client/src/features/update/UpdateDeviceCard.test.tsx
git commit -m "feat(client): Update-Modus page (per-device fast update + note + progress)"
```

---

### Task 13: Client — Update-Anmerkung in the device drawer

**Files:**
- Modify: `client/src/features/devices/DeviceFields.tsx` (admin replace field)
- Modify: `client/src/features/devices/DeviceEditForm.tsx` (include `updateNote` in patch diff)
- Modify: `client/src/features/devices/DeviceDetailDrawer.tsx` (non-admin append UI + ⚠ header)
- Create: `client/src/features/devices/UpdateNotePanel.tsx` (non-admin read + append)
- Test: `client/src/features/devices/UpdateNotePanel.test.tsx`

- [ ] **Step 1: Admin replace field.** In `DeviceFields.tsx`, in the "Bemerkung" section (after the `notes` Form.Item, ~line 174), add a second column for the admin-editable Update-Anmerkung:

```tsx
        <Col xs={24}>
          <Form.Item name="updateNote" label="Update-Anmerkung (Abweichungen)">
            <Input.TextArea rows={3} disabled={lockedFor('updateNote')} />
          </Form.Item>
        </Col>
```

(`lockedFor('updateNote')` is true for updaters — they use the append panel below, not this replace field. Admins edit/clear here to resolve.)

- [ ] **Step 2: Include `updateNote` in the edit-form diff.** In `DeviceEditForm.tsx`, add to the `next` patch object (after `loanable:`):

```tsx
      updateNote: values.updateNote ?? null,
```

and to the `FormValues`/`initialValues` it is already spread from `device`. (No special mapping needed; it's a plain string.)

- [ ] **Step 3: Implement the non-admin append panel** `client/src/features/devices/UpdateNotePanel.tsx`:

```tsx
import { useState } from 'react';
import { Button, Input, Space, Typography, message } from 'antd';
import { useUpdateNote } from '../../hooks/useUpdateNote';

export interface UpdateNotePanelProps {
  deviceId: string;
  updateNote: string | null;
}

/** Read-only history of the Update-Anmerkung plus an append-only input. Used for
 *  non-admin roles (admins edit the field directly in the form). */
export function UpdateNotePanel({ deviceId, updateNote }: UpdateNotePanelProps) {
  const append = useUpdateNote(deviceId);
  const [text, setText] = useState('');

  const submit = async () => {
    if (!text.trim()) return;
    try {
      await append.mutateAsync(text.trim());
      message.success('Anmerkung hinzugefügt');
      setText('');
    } catch {
      message.error('Anmerkung fehlgeschlagen');
    }
  };

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <Typography.Text strong>Update-Anmerkung</Typography.Text>
      {updateNote ? (
        <Typography.Paragraph type="warning" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
          {updateNote}
        </Typography.Paragraph>
      ) : (
        <Typography.Text type="secondary">Keine Anmerkung.</Typography.Text>
      )}
      <Space.Compact style={{ width: '100%' }}>
        <Input
          placeholder="Anmerkung anhängen (z. B. ISSI weicht ab)…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPressEnter={submit}
        />
        <Button onClick={submit} loading={append.isPending}>Hinzufügen</Button>
      </Space.Compact>
    </Space>
  );
}
```

- [ ] **Step 4: Wire into the drawer.** In `DeviceDetailDrawer.tsx`:
  - Import: `import { FiAlertTriangle } from 'react-icons/fi'; import { UpdateNotePanel } from './UpdateNotePanel';`
  - In the `Descriptions`, add a row for the marker when present (after "Geändert"):

```tsx
          {device.updateNote && (
            <Descriptions.Item label="Abweichung">
              <Tag color="warning" icon={<FiAlertTriangle aria-label="Abweichung gemeldet" />}>
                gemeldet
              </Tag>
            </Descriptions.Item>
          )}
```
  - For non-admins, render the append panel (admins use the form field instead). After the `DeviceEditForm` block (line 103):

```tsx
        {!isAdmin && device && <UpdateNotePanel deviceId={device.id} updateNote={device.updateNote} />}
```

- [ ] **Step 5: Write the test** `client/src/features/devices/UpdateNotePanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { UpdateNotePanel } from './UpdateNotePanel';

beforeEach(() => {
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ id: 'd1', updateNote: '[x] y' }), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
});
afterEach(() => vi.restoreAllMocks());

test('renders existing note and appends a new one', async () => {
  const user = userEvent.setup();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <UpdateNotePanel deviceId="d1" updateNote={'[2026-06-01 · Eva] alt'} />
    </QueryClientProvider>,
  );
  expect(screen.getByText(/Eva\] alt/)).toBeInTheDocument();
  await user.type(screen.getByPlaceholderText(/anhängen/i), 'neu');
  await user.click(screen.getByRole('button', { name: 'Hinzufügen' }));
  const calls = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
  expect(calls.some(([url]) => url === '/api/devices/d1/update-note')).toBe(true);
});
```

- [ ] **Step 6: Run tests — expect PASS**

Run: `./node_modules/.bin/vitest run client/src/features/devices/UpdateNotePanel.test.tsx`

- [ ] **Step 7: Full gates + commit**

Run: `./node_modules/.bin/vitest run && ./node_modules/.bin/tsc --noEmit -p shared/tsconfig.json && ./node_modules/.bin/tsc --noEmit -p server/tsconfig.json && ./node_modules/.bin/tsc --noEmit -p client/tsconfig.json && ./node_modules/.bin/eslint . && pnpm --filter @ra/client build`

```bash
git add client/src/features/devices/DeviceFields.tsx client/src/features/devices/DeviceEditForm.tsx client/src/features/devices/DeviceDetailDrawer.tsx client/src/features/devices/UpdateNotePanel.tsx client/src/features/devices/UpdateNotePanel.test.tsx
git commit -m "feat(client): Update-Anmerkung in device drawer (admin edit / updater append)"
```

---

## Final verification

- [ ] Run the full suite + all gates (command in Task 13 Step 7). All green.
- [ ] Manual smoke (`pnpm dev`, dev-bypass admin): list shows Funktion + ⚠; column picker persists across reload; search-field picker narrows results; filter drawer badge counts; `/update` page: pick target, search by ISSI, one-tap apply flips badge, note expander appends without touching `notes`; switch `DEV_USER_ROLE=updater` and confirm the drawer shows the append panel (no replace field) and the Update-Modus works.

## Self-review notes (coverage map)

- Spec §3.1 updateNote column → Task 1; §3.2 append endpoint → Task 3; §3.3 ⚠ marker → Tasks 8 (column), 10 (mobile), 13 (drawer).
- Spec §4.1 columns/picker → Task 8; §4.2 configurable search → Tasks 4 (server) + 8 (client picker) + 7 (query string); §4.3 filter panel → Tasks 5 (server) + 9 (client); §4.4 mobile → Task 10; §4.5 persistence hook → Task 6.
- Spec §5 Update-Modus → Tasks 11 (hook) + 12 (page); §5.3 drawer note → Task 13.
- Spec §6 roles: append endpoint role-agnostic (Task 3), updater cannot replace `updateNote` (`lockedFor('updateNote')`, Task 13); `filterEditableFields` unchanged.
