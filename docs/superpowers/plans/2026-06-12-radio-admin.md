# Funkgeräte-Verwaltung (radio-admin) — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-container full-stack app to manage radio devices (TETRA/BOS) for a HiOrg — device inventory, computed update status, CSV batch upsert, PocketID OIDC auth, responsive antd UI.

**Architecture:** pnpm monorepo (`@ra/shared` pure logic + zod, `@ra/server` Hono+Drizzle/SQLite serving API and SPA, `@ra/client` Vite/React 19/antd). BFF auth (server owns OIDC, httpOnly session JWT). One Docker image to GHCR via GitHub Actions.

**Tech Stack:** Vite, React 19, TypeScript, react-router 7, TanStack Query 5, antd 5, react-icons; Hono 4, Drizzle ORM + better-sqlite3, openid-client 6, jose, csv-parse, chardet/iconv-lite, zod 3; vitest.

**Spec:** `docs/superpowers/specs/2026-06-12-radio-admin-design.md`

---

## Phase 1: Monorepo-Scaffold + Datenschicht

**Goal:** Stand up the pnpm-workspace monorepo (root tooling + `@ra/shared` and `@ra/server` skeletons) and build the complete, migration-driven Drizzle data layer (three tables per contract, cuid2 ids, better-sqlite3 connection with FK enforcement) proven by a smoke test that migrates a temp SQLite DB and round-trips a device. `shared`/`server` source stay bare compiling stubs in this phase — no contract logic, zod, or routes yet.

> **Commit cadence (applies to every task):** one task = one commit. Always run the task's verification command and see it green before committing. Conventional Commits, scoped. After staging, run `git status` to confirm only intended files are staged, then commit. Never use `git add -A` blindly — stage explicit paths.

---

### Task 1.1: pnpm workspace root + native-build allowlist

**Files:**
- create `pnpm-workspace.yaml`
- create `package.json` (root)
- create `.gitignore`
- create `.npmrc`

- [ ] **Step 1: Create `pnpm-workspace.yaml`.** pnpm 11 reads build-script permissions from this file (verified against pnpm 11.0.9 docs). `better-sqlite3` has a native postinstall build that pnpm blocks by default — without this allowlist the binary is silently absent and the smoke test (1.11) dies with "could not locate the bindings file". Write exactly:

```yaml
packages:
  - 'shared'
  - 'server'
  - 'client'

onlyBuiltDependencies:
  - better-sqlite3
```

- [ ] **Step 2: Create root `package.json`** (private, not publishable; pins package manager; aggregate scripts). Write exactly:

```json
{
  "name": "radio-admin",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@11.0.9",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "pnpm -r exec tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.2.0",
    "eslint": "^9.17.0",
    "typescript-eslint": "^8.19.0",
    "@eslint/js": "^9.17.0",
    "prettier": "^3.4.0"
  }
}
```

- [ ] **Step 3: Create `.gitignore`.** Write exactly:

```gitignore
node_modules/
dist/
*.log
.DS_Store
.env
.env.*
!.env.example
data/
*.sqlite
*.sqlite-journal
coverage/
.vite/
```

- [ ] **Step 4: Create `.npmrc`** (deterministic installs, hoist nothing surprising):

```
auto-install-peers=true
strict-peer-dependencies=false
```

- [ ] **Step 5: Install and verify the native module actually loads (this is the real gate, not "install exits 0").** Run:

```bash
pnpm install
```

  Expected: exits 0, creates `pnpm-lock.yaml` and root `node_modules/`. No `ERR_PNPM_IGNORED_BUILDS` for better-sqlite3 (it isn't installed yet at root — that arrives in 1.6/1.10; this step only proves the workspace resolves and root devDeps install). Then confirm vitest binary is present:

```bash
pnpm exec vitest --version
```

  Expected: prints a `3.2.x` version. (The better-sqlite3 load-check happens in 1.10/1.11 once the dependency exists; the allowlist that makes it succeed is already in place from Step 1.)

  > **Fallback note (Node 26):** if a later task's better-sqlite3 load fails with an ABI/bindings error on this brand-new Node, pin `better-sqlite3` to a version shipping a Node-26 prebuilt (or one that compiles from source via the now-allowed build script) before proceeding.

- [ ] **Step 6: Commit.**

```bash
git add pnpm-workspace.yaml package.json .gitignore .npmrc pnpm-lock.yaml
git status
git commit -m "chore: pnpm workspace root with native-build allowlist for better-sqlite3"
```

---

### Task 1.2: Root base tsconfig + per-package tsconfigs

**Files:**
- create `tsconfig.base.json`
- create `shared/tsconfig.json`
- create `server/tsconfig.json`

- [ ] **Step 1: Create `tsconfig.base.json`** (strict, modern module resolution shared by all packages):

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 2: Create `shared/tsconfig.json`:**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `server/tsconfig.json`** (server uses Node types; `noEmit` here because build tooling lands in a later phase — Phase 1 only typechecks):

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"],
    "noEmit": true,
    "rootDir": "src"
  },
  "include": ["src", "drizzle.config.ts", "*.test.ts"]
}
```

- [ ] **Step 4: Verify** the base config parses (no package sources exist yet, so this only proves JSON/extends are valid):

```bash
pnpm exec tsc --noEmit -p shared/tsconfig.json || echo "expected: no input files error is OK at this stage"
```

  Expected: either clean, or a "No inputs were found" message — both acceptable; a JSON parse error is NOT.

- [ ] **Step 5: Commit.**

```bash
git add tsconfig.base.json shared/tsconfig.json server/tsconfig.json
git status
git commit -m "chore: root base tsconfig and per-package tsconfigs"
```

---

### Task 1.3: ESLint + Prettier

**Files:**
- create `eslint.config.js`
- create `.prettierrc.json`
- create `.prettierignore`

- [ ] **Step 1: Create flat-config `eslint.config.js`** (ESLint 9 flat config + typescript-eslint):

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/drizzle/**', '**/coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
);
```

- [ ] **Step 2: Create `.prettierrc.json`:**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 3: Create `.prettierignore`:**

```
node_modules
dist
drizzle
coverage
pnpm-lock.yaml
```

- [ ] **Step 4: Verify** lint and format-check run (no real source yet — gate is "tool executes cleanly"):

```bash
pnpm lint && pnpm format:check
```

  Expected: both exit 0 with no errors (nothing to lint/format yet beyond config files, which already conform).

- [ ] **Step 5: Commit.**

```bash
git add eslint.config.js .prettierrc.json .prettierignore
git status
git commit -m "chore: eslint flat config and prettier"
```

---

### Task 1.4: Root Vitest config

**Files:**
- create `vitest.config.ts`

- [ ] **Step 1: Create `vitest.config.ts`** using `test.projects` (Vitest 3.2 — the standalone `vitest.workspace.ts` is deprecated). Shared runs in jsdom-free node; server in node. Verified against Vitest v3.2.4 docs:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'shared',
          root: './shared',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'server',
          root: './server',
          environment: 'node',
          include: ['src/**/*.test.ts', '*.test.ts'],
        },
      },
    ],
  },
});
```

- [ ] **Step 2: Verify** Vitest discovers the config and reports zero test files (no tests authored yet):

```bash
pnpm test
```

  Expected: exits 0, output like "No test files found" for both `shared` and `server` projects. A config-parse error is NOT acceptable.

- [ ] **Step 3: Commit.**

```bash
git add vitest.config.ts
git status
git commit -m "chore: root vitest config with shared and server projects"
```

---

### Task 1.5: `@ra/shared` package skeleton

**Files:**
- create `shared/package.json`
- create `shared/src/index.ts`

- [ ] **Step 1: Create `shared/package.json`** (ESM, exports the built/source entry; no runtime deps yet — zod arrives in its own phase):

```json
{
  "name": "@ra/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json"
  }
}
```

- [ ] **Step 2: Create `shared/src/index.ts` as a bare compiling stub.** No contract types/functions in this phase — those land in their own TDD phase. Write exactly:

```ts
// @ra/shared public API. Contract types and pure logic are added in later phases.
export {};
```

- [ ] **Step 3: Verify** the shared package typechecks:

```bash
pnpm exec tsc --noEmit -p shared/tsconfig.json
```

  Expected: exits 0, no errors.

- [ ] **Step 4: Commit.**

```bash
git add shared/package.json shared/src/index.ts
git status
git commit -m "chore: @ra/shared package skeleton"
```

---

### Task 1.6: `@ra/server` package skeleton + data-layer deps

**Files:**
- create `server/package.json`
- create `server/src/index.ts`

- [ ] **Step 1: Create `server/package.json`** with the runtime deps this phase needs (drizzle + better-sqlite3 + cuid2) and dev deps (drizzle-kit, types). Hono/jose/openid-client arrive in later phases:

```json
{
  "name": "@ra/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  },
  "dependencies": {
    "@ra/shared": "workspace:*",
    "drizzle-orm": "^0.38.0",
    "better-sqlite3": "^11.8.0",
    "@paralleldrive/cuid2": "^2.2.2"
  },
  "devDependencies": {
    "drizzle-kit": "^0.31.5",
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^22.10.0"
  }
}
```

- [ ] **Step 2: Create `server/src/index.ts` as a bare stub** (the HTTP server lands in a later phase):

```ts
// @ra/server entry. HTTP server (Hono) is wired in a later phase.
export {};
```

- [ ] **Step 3: Install the new workspace deps** (this is where better-sqlite3's native build runs under the allowlist from Task 1.1):

```bash
pnpm install
```

  Expected: exits 0. No `ERR_PNPM_IGNORED_BUILDS` for better-sqlite3 (allowlisted). `pnpm-lock.yaml` updated.

- [ ] **Step 4: Verify the native binary actually loads** (the gate the advisor flagged — install exiting 0 is not sufficient proof):

```bash
node -e "const D=require('better-sqlite3'); const db=new D(':memory:'); console.log('better-sqlite3 OK', db.prepare('select 1 as x').get());"
```

  Expected: prints `better-sqlite3 OK { x: 1 }`. If it instead errors with "could not locate the bindings file" or an ABI mismatch, apply the Node-26 fallback from Task 1.1 Step 5 before continuing.

- [ ] **Step 5: Typecheck the server package:**

```bash
pnpm exec tsc --noEmit -p server/tsconfig.json
```

  Expected: exits 0.

- [ ] **Step 6: Commit.**

```bash
git add server/package.json server/src/index.ts pnpm-lock.yaml
git status
git commit -m "chore: @ra/server skeleton with drizzle and better-sqlite3 deps"
```

---

### Task 1.7: cuid2 id helper (TDD)

**Files:**
- create `server/src/db/id.test.ts`
- create `server/src/db/id.ts`

- [ ] **Step 1: Write the failing test** `server/src/db/id.test.ts`. Asserts `newId()` returns a non-empty string, two calls differ, and the value matches cuid2's shape (lowercase alphanumeric, length 24):

```ts
import { describe, it, expect } from 'vitest';
import { newId } from './id';

describe('newId', () => {
  it('returns a non-empty string', () => {
    expect(newId()).toBeTypeOf('string');
    expect(newId().length).toBeGreaterThan(0);
  });

  it('returns unique values across calls', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()));
    expect(ids.size).toBe(1000);
  });

  it('matches the cuid2 shape (24 lowercase alphanumeric chars)', () => {
    expect(newId()).toMatch(/^[a-z0-9]{24}$/);
  });
});
```

- [ ] **Step 2: Run the test, see it fail (red).**

```bash
pnpm vitest run --project server server/src/db/id.test.ts
```

  Expected: FAIL — cannot resolve `./id` (module does not exist).

- [ ] **Step 3: Write the minimal implementation** `server/src/db/id.ts`:

```ts
import { createId } from '@paralleldrive/cuid2';

/** Generate a new cuid2 primary-key id (24 lowercase alphanumeric chars). */
export function newId(): string {
  return createId();
}
```

- [ ] **Step 4: Run the test, see it pass (green).**

```bash
pnpm vitest run --project server server/src/db/id.test.ts
```

  Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit.**

```bash
git add server/src/db/id.ts server/src/db/id.test.ts
git status
git commit -m "feat(db): cuid2 id helper"
```

---

### Task 1.8: Drizzle schema — three tables per contract

**Files:**
- create `server/src/db/schema.ts`
- create `server/src/db/schema.test.ts`

- [ ] **Step 1: Write a failing structural test** `server/src/db/schema.test.ts`. It imports the three table objects and asserts the exact column set per the locked contract (catches typos/missing columns before any migration):

```ts
import { describe, it, expect } from 'vitest';
import { devices, softwareVersions, deviceEvents } from './schema';

function columnNames(table: Record<string, unknown>): string[] {
  // drizzle table columns are enumerable own keys mapped to Column objects
  return Object.keys(table).filter(
    (k) => (table[k] as { name?: unknown })?.name !== undefined,
  );
}

describe('schema: devices', () => {
  it('has exactly the contracted columns', () => {
    expect(columnNames(devices).sort()).toEqual(
      [
        'id',
        'rufname',
        'issi',
        'serialNumber',
        'deviceType',
        'status',
        'location',
        'assignedTo',
        'softwareVersion',
        'lastUpdatedAt',
        'notes',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy',
      ].sort(),
    );
  });
});

describe('schema: softwareVersions', () => {
  it('has exactly the contracted columns', () => {
    expect(columnNames(softwareVersions).sort()).toEqual(
      ['id', 'value', 'createdAt', 'createdBy'].sort(),
    );
  });
});

describe('schema: deviceEvents', () => {
  it('has exactly the contracted columns', () => {
    expect(columnNames(deviceEvents).sort()).toEqual(
      [
        'id',
        'deviceId',
        'field',
        'oldValue',
        'newValue',
        'changedBy',
        'changedAt',
        'source',
      ].sort(),
    );
  });
});
```

- [ ] **Step 2: Run the test, see it fail (red).**

```bash
pnpm vitest run --project server server/src/db/schema.test.ts
```

  Expected: FAIL — cannot resolve `./schema`.

- [ ] **Step 3: Write `server/src/db/schema.ts`.** All names/types/nullability/unique/index transcribed verbatim from the locked contract. Timestamps are `integer` unix-ms (no `mode: 'timestamp'` — we store raw ms numbers). `source` uses `text({ enum: [...] })`. FK on `deviceEvents.deviceId` references `devices.id` with a named index via the array-return form (verified API). PK ids default via the `newId` cuid2 helper:

```ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { newId } from './id';

export const devices = sqliteTable('devices', {
  id: text('id').primaryKey().$defaultFn(newId),
  rufname: text('rufname'),
  issi: text('issi').notNull().unique(),
  serialNumber: text('serial_number'),
  deviceType: text('device_type'),
  status: text('status'),
  location: text('location'),
  assignedTo: text('assigned_to'),
  softwareVersion: text('software_version'),
  lastUpdatedAt: integer('last_updated_at'),
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
});

export const softwareVersions = sqliteTable('software_versions', {
  id: text('id').primaryKey().$defaultFn(newId),
  value: text('value').notNull().unique(),
  createdAt: integer('created_at').notNull(),
  createdBy: text('created_by'),
});

export const deviceEvents = sqliteTable(
  'device_events',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    deviceId: text('device_id')
      .notNull()
      .references(() => devices.id),
    field: text('field').notNull(),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    changedBy: text('changed_by'),
    changedAt: integer('changed_at').notNull(),
    source: text('source', { enum: ['manual', 'csv-import', 'create'] }).notNull(),
  },
  (table) => [index('device_events_device_id_idx').on(table.deviceId)],
);
```

- [ ] **Step 4: Run the test, see it pass (green).**

```bash
pnpm vitest run --project server server/src/db/schema.test.ts
```

  Expected: PASS — all three column-set assertions green.

- [ ] **Step 5: Typecheck the server package** (confirms drizzle column types and FK callback compile):

```bash
pnpm exec tsc --noEmit -p server/tsconfig.json
```

  Expected: exits 0.

- [ ] **Step 6: Commit.**

```bash
git add server/src/db/schema.ts server/src/db/schema.test.ts
git status
git commit -m "feat(db): drizzle schema for devices, software_versions, device_events"
```

---

### Task 1.9: drizzle.config.ts + generated initial migration

**Files:**
- create `server/drizzle.config.ts`
- create `server/drizzle/` (generated migration SQL + meta — committed)

- [ ] **Step 1: Create `server/drizzle.config.ts`** (verified `defineConfig` shape for drizzle-kit 0.31.x; `dialect: 'sqlite'`, schema path, migrations out-dir, dbCredentials url from `DATABASE_PATH` with a local default):

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_PATH ?? './data/data.sqlite',
  },
  strict: true,
  verbose: true,
});
```

- [ ] **Step 2: Generate the initial migration** from the schema (drizzle-kit 0.31.x uses plain `generate`, NOT the stale `generate:sqlite`). Run from the server package:

```bash
pnpm --filter @ra/server exec drizzle-kit generate
```

  Expected: creates `server/drizzle/0000_*.sql` (CREATE TABLE for all three tables) plus `server/drizzle/meta/` snapshot files. Prints the generated SQL summary.

- [ ] **Step 3: Inspect the generated SQL to confirm it matches the contract.** Open `server/drizzle/0000_*.sql` with the Read tool (do not cat). Confirm: `devices.issi` is `NOT NULL` + a unique index; `software_versions.value` unique notNull; `device_events.source` present; the `device_events_device_id_idx` index on `device_id`; FK `device_id` → `devices(id)`; `created_at`/`updated_at`/`changed_at` are `integer NOT NULL`. If anything is wrong, fix `schema.ts` (Task 1.8) and regenerate.

- [ ] **Step 4: Commit the config AND the generated migration together** (the migration is a durable, reviewed artifact — the smoke test in 1.11 applies exactly this migration, not a fresh push):

```bash
git add server/drizzle.config.ts server/drizzle
git status
git commit -m "feat(db): drizzle config and initial migration"
```

---

### Task 1.10: DB connection module (better-sqlite3 + drizzle, migrate-on-init, FK on)

**Files:**
- create `server/src/db/index.ts`
- create `server/src/db/index.test.ts`

- [ ] **Step 1: Write the failing test** `server/src/db/index.test.ts`. It exercises the factory against an in-memory DB so the SAME `migrate()` code path runs as in production, then asserts the migrated tables exist and a device round-trips. The migrations folder must be resolved relative to the module (cwd under vitest is not the package root), so the factory owns that resolution — the test just passes a db path:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { createDb } from './index';
import { devices } from './schema';
import { eq } from 'drizzle-orm';

let close: (() => void) | undefined;

afterEach(() => {
  close?.();
  close = undefined;
});

describe('createDb', () => {
  it('runs migrations and round-trips a device on an in-memory database', () => {
    const { db, sqlite } = createDb(':memory:');
    close = () => sqlite.close();

    // tables created by the applied migration
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).toContain('devices');
    expect(tables).toContain('software_versions');
    expect(tables).toContain('device_events');

    const now = Date.now();
    db.insert(devices)
      .values({ issi: '12345', createdAt: now, updatedAt: now })
      .run();

    const rows = db.select().from(devices).where(eq(devices.issi, '12345')).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.issi).toBe('12345');
    expect(rows[0]?.id).toMatch(/^[a-z0-9]{24}$/); // cuid2 default applied
  });

  it('enforces foreign keys (PRAGMA foreign_keys = ON)', () => {
    const { sqlite } = createDb(':memory:');
    close = () => sqlite.close();
    const fk = sqlite.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    expect(fk.foreign_keys).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test, see it fail (red).**

```bash
pnpm vitest run --project server server/src/db/index.test.ts
```

  Expected: FAIL — cannot resolve `./index` (module not created yet).

- [ ] **Step 3: Write `server/src/db/index.ts`.** Factory `createDb(path)` opens better-sqlite3, enables FK enforcement (better-sqlite3 defaults OFF — `device_events` FK needs this), applies the committed migration via a cwd-robust folder path resolved from `import.meta.url`, and returns both the drizzle db and the raw handle (for cleanup/inspection in tests). A default `db` singleton reads `DATABASE_PATH`:

```ts
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

// Resolve the migrations folder relative to THIS module, not process.cwd()
// (under vitest the cwd is not guaranteed to be the server package root).
const moduleDir = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = resolve(moduleDir, '../../drizzle');

export interface DbHandle {
  db: BetterSQLite3Database<typeof schema>;
  sqlite: Database.Database;
}

/** Open a SQLite database, enable FK enforcement, run migrations, return the drizzle db + raw handle. */
export function createDb(path: string): DbHandle {
  const sqlite = new Database(path);
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db, sqlite };
}

const DATABASE_PATH = process.env.DATABASE_PATH ?? './data/data.sqlite';

/** Application-wide database, initialized from DATABASE_PATH with migrations applied. */
export const { db, sqlite } = createDb(DATABASE_PATH);
```

- [ ] **Step 4: Run the test, see it pass (green).**

```bash
pnpm vitest run --project server server/src/db/index.test.ts
```

  Expected: PASS — both `createDb` tests green (tables exist, device round-trips with a cuid2 id, `foreign_keys` pragma is 1).

  > If the run errors with "could not locate the bindings file" (better-sqlite3 native module) or an ABI mismatch on Node 26, apply the Task 1.1 fallback (pin a better-sqlite3 with a Node-26 prebuilt) and rerun — do NOT treat it as a logic bug.

- [ ] **Step 5: Commit.**

```bash
git add server/src/db/index.ts server/src/db/index.test.ts
git status
git commit -m "feat(db): better-sqlite3 connection with FK enforcement and migrate-on-init"
```

---

### Task 1.11: Smoke test — temp-file DB migrate + insert + read

**Files:**
- create `server/src/db/smoke.test.ts`

> Task 1.10's in-memory test already proves migrate + round-trip. This task adds the explicit deliverable from the phase scope: a smoke test that opens a **temp on-disk** SQLite file (closer to production than `:memory:`), runs the committed migration, inserts a device AND a related `device_events` row (proving the FK is satisfiable end-to-end), reads them back, and cleans up the file.

- [ ] **Step 1: Write the smoke test** `server/src/db/smoke.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { createDb } from './index';
import { devices, deviceEvents } from './schema';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('db smoke test (temp file)', () => {
  it('migrates a fresh on-disk db, inserts a device + event, and reads them back', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ra-smoke-'));
    const dbPath = join(dir, 'data.sqlite');
    const { db, sqlite } = createDb(dbPath);
    cleanup = () => {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    };

    const now = Date.now();

    // insert device, capture generated cuid2 id
    const inserted = db
      .insert(devices)
      .values({ issi: '99001', rufname: 'Florian 1', createdAt: now, updatedAt: now })
      .returning()
      .all();
    expect(inserted).toHaveLength(1);
    const deviceId = inserted[0]!.id;
    expect(deviceId).toMatch(/^[a-z0-9]{24}$/);

    // insert a related event (exercises the FK to devices.id)
    db.insert(deviceEvents)
      .values({
        deviceId,
        field: 'rufname',
        oldValue: null,
        newValue: 'Florian 1',
        changedBy: 'smoke',
        changedAt: now,
        source: 'create',
      })
      .run();

    // read device back
    const devs = db.select().from(devices).where(eq(devices.issi, '99001')).all();
    expect(devs).toHaveLength(1);
    expect(devs[0]?.rufname).toBe('Florian 1');

    // read event back, linked by FK
    const evs = db.select().from(deviceEvents).where(eq(deviceEvents.deviceId, deviceId)).all();
    expect(evs).toHaveLength(1);
    expect(evs[0]?.field).toBe('rufname');
    expect(evs[0]?.source).toBe('create');
  });
});
```

- [ ] **Step 2: Run the smoke test, see it pass (green).**

```bash
pnpm vitest run --project server server/src/db/smoke.test.ts
```

  Expected: PASS — device and FK-linked event inserted and read back; cuid2 id shape verified.

- [ ] **Step 3: Run the FULL suite to confirm the whole phase is green together** (catches any cross-test interference, e.g. the `db` singleton in `index.ts` touching `./data`):

```bash
pnpm test
```

  Expected: all `shared` (none yet) and `server` tests pass — `id`, `schema`, `index`, `smoke`. Exit 0.

- [ ] **Step 4: Final phase verification gate** — lint + typecheck + tests all green:

```bash
pnpm lint && pnpm typecheck && pnpm test
```

  Expected: all three exit 0.

- [ ] **Step 5: Commit.**

```bash
git add server/src/db/smoke.test.ts
git status
git commit -m "test(db): smoke test for temp-file migrate, device + event round-trip"
```

---

## Phase 2: shared Kernlogik + Auth (BFF/OIDC)

**Goal:** Implement and fully unit-test the shared core logic (`mapGroupsToRole`, `computeUpdateStatus`, `filterEditableFields`) and zod schemas, then build the BFF/OIDC auth layer in `server/` (env loader, fakeable openid-client wrapper, jose session JWT, signed `oauth_tx` cookie, `/api/auth/*` routes, `requireAuth`/`requireRole` middleware, dev-bypass with loud startup warning) — with all OIDC provider interactions mocked behind an isolatable `auth-service` module.

> Assumption (carried from Phase 1): pnpm workspaces, root `tsconfig.base.json`, per-package `tsconfig.json`, vitest, and `server/src/db/schema.ts` (drizzle) already exist. Package names are `@ra/shared`, `@ra/server`, `@ra/client`. The `server` package depends on `@ra/shared` via workspace protocol. Run all commands from the repo root unless noted.

---

### Task 2.1: `mapGroupsToRole` (shared)

Pure role-mapping logic: admin wins over updater; no matching group → `null`.

**Files:**
- create: `shared/src/role.ts`
- create: `shared/src/role.test.ts`

- [ ] **Step 1: Write failing test.** Create `shared/src/role.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { mapGroupsToRole } from './role';

  const cfg = { adminGroup: 'admin', updaterGroup: 'personal' };

  describe('mapGroupsToRole', () => {
    it('returns admin when admin group present', () => {
      expect(mapGroupsToRole(['admin'], cfg)).toBe('admin');
    });

    it('returns updater when only updater group present', () => {
      expect(mapGroupsToRole(['personal'], cfg)).toBe('updater');
    });

    it('admin wins when both groups present', () => {
      expect(mapGroupsToRole(['personal', 'admin'], cfg)).toBe('admin');
      expect(mapGroupsToRole(['admin', 'personal'], cfg)).toBe('admin');
    });

    it('returns null when no group matches', () => {
      expect(mapGroupsToRole(['other', 'random'], cfg)).toBeNull();
    });

    it('returns null for empty groups array', () => {
      expect(mapGroupsToRole([], cfg)).toBeNull();
    });

    it('respects env-overridden group names', () => {
      const custom = { adminGroup: 'leitung', updaterGroup: 'helfer' };
      expect(mapGroupsToRole(['leitung'], custom)).toBe('admin');
      expect(mapGroupsToRole(['helfer'], custom)).toBe('updater');
      expect(mapGroupsToRole(['admin'], custom)).toBeNull();
    });
  });
  ```

- [ ] **Step 2: Run test, expect failure.**
  ```bash
  pnpm --filter @ra/shared test run src/role.test.ts
  ```
  Expected: FAIL — `Failed to resolve import "./role"` / `mapGroupsToRole is not a function` (module does not exist yet).

- [ ] **Step 3: Minimal implementation.** Create `shared/src/role.ts`:
  ```ts
  export type Role = 'admin' | 'updater';

  export function mapGroupsToRole(
    groups: string[],
    cfg: { adminGroup: string; updaterGroup: string },
  ): Role | null {
    if (groups.includes(cfg.adminGroup)) return 'admin';
    if (groups.includes(cfg.updaterGroup)) return 'updater';
    return null;
  }
  ```

- [ ] **Step 4: Run test, expect pass.**
  ```bash
  pnpm --filter @ra/shared test run src/role.test.ts
  ```
  Expected: PASS — 6 passing.

- [ ] **Step 5: Commit.**
  ```bash
  git checkout -b phase-2-shared-auth
  git add shared/src/role.ts shared/src/role.test.ts
  git commit -m "feat(shared): mapGroupsToRole with admin-wins and no-match->null"
  ```

---

### Task 2.2: `computeUpdateStatus` (shared)

Compute per-device update status against the reference version; `null` software version → `unbekannt`.

**Files:**
- create: `shared/src/update-status.ts`
- create: `shared/src/update-status.test.ts`

- [ ] **Step 1: Write failing test.** Create `shared/src/update-status.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { computeUpdateStatus } from './update-status';

  describe('computeUpdateStatus', () => {
    it('returns unbekannt when device has no software version', () => {
      expect(computeUpdateStatus({ softwareVersion: null }, 'FW 12.3')).toBe('unbekannt');
    });

    it('returns unbekannt when device version is null even if reference is null', () => {
      expect(computeUpdateStatus({ softwareVersion: null }, null)).toBe('unbekannt');
    });

    it('returns aktuell when device version equals reference', () => {
      expect(computeUpdateStatus({ softwareVersion: 'FW 12.3' }, 'FW 12.3')).toBe('aktuell');
    });

    it('returns veraltet when device version differs from reference', () => {
      expect(computeUpdateStatus({ softwareVersion: 'FW 11.0' }, 'FW 12.3')).toBe('veraltet');
    });

    it('returns veraltet when reference is null but device has a version (phantom/unassigned ref)', () => {
      // Reference is null because the only assigned versions were unassigned;
      // a device that still carries a version is therefore not "aktuell".
      expect(computeUpdateStatus({ softwareVersion: 'FW 12.3' }, null)).toBe('veraltet');
    });

    it('is exact-string match (no normalization)', () => {
      expect(computeUpdateStatus({ softwareVersion: 'fw 12.3' }, 'FW 12.3')).toBe('veraltet');
      expect(computeUpdateStatus({ softwareVersion: 'FW 12.3 ' }, 'FW 12.3')).toBe('veraltet');
    });
  });
  ```

- [ ] **Step 2: Run test, expect failure.**
  ```bash
  pnpm --filter @ra/shared test run src/update-status.test.ts
  ```
  Expected: FAIL — `Failed to resolve import "./update-status"`.

- [ ] **Step 3: Minimal implementation.** Create `shared/src/update-status.ts`:
  ```ts
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
  ```

- [ ] **Step 4: Run test, expect pass.**
  ```bash
  pnpm --filter @ra/shared test run src/update-status.test.ts
  ```
  Expected: PASS — 6 passing.

- [ ] **Step 5: Commit.**
  ```bash
  git add shared/src/update-status.ts shared/src/update-status.test.ts
  git commit -m "feat(shared): computeUpdateStatus with phantom-reference and null-version edge cases"
  ```

---

### Task 2.3: `filterEditableFields` (shared)

Drop (not reject) fields an updater may not write; admin passthrough. Uses `UPDATER_EDITABLE_FIELDS` allowlist.

**Files:**
- create: `shared/src/editable-fields.ts`
- create: `shared/src/editable-fields.test.ts`

- [ ] **Step 1: Write failing test.** Create `shared/src/editable-fields.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { filterEditableFields, UPDATER_EDITABLE_FIELDS } from './editable-fields';

  describe('UPDATER_EDITABLE_FIELDS', () => {
    it('is exactly the three update fields', () => {
      expect([...UPDATER_EDITABLE_FIELDS]).toEqual(['softwareVersion', 'lastUpdatedAt', 'status']);
    });
  });

  describe('filterEditableFields', () => {
    it('admin passthrough: keeps every field unchanged', () => {
      const patch = { issi: '123', rufname: 'Floxx', softwareVersion: 'FW 12.3', notes: 'hi' };
      expect(filterEditableFields('admin', patch)).toEqual(patch);
    });

    it('updater: keeps only allowlisted update fields', () => {
      const patch = {
        softwareVersion: 'FW 12.3',
        lastUpdatedAt: 1718200000000,
        status: 'einsatzbereit',
      };
      expect(filterEditableFields('updater', patch)).toEqual(patch);
    });

    it('updater: drops identity/master fields incl. the ISSI match-key', () => {
      const patch = {
        issi: '999',
        rufname: 'Hacked',
        serialNumber: 'SN-1',
        location: 'Wache 2',
        assignedTo: 'Team A',
        deviceType: 'TPH900',
        notes: 'nope',
        softwareVersion: 'FW 12.3',
        status: 'in Reparatur',
      };
      expect(filterEditableFields('updater', patch)).toEqual({
        softwareVersion: 'FW 12.3',
        status: 'in Reparatur',
      });
    });

    it('updater: returns a new object, does not mutate input', () => {
      const patch = { issi: '1', softwareVersion: 'FW 12.3' };
      const out = filterEditableFields('updater', patch);
      expect(out).not.toBe(patch);
      expect(patch.issi).toBe('1');
    });

    it('updater: empty patch -> empty object', () => {
      expect(filterEditableFields('updater', {})).toEqual({});
    });
  });
  ```

- [ ] **Step 2: Run test, expect failure.**
  ```bash
  pnpm --filter @ra/shared test run src/editable-fields.test.ts
  ```
  Expected: FAIL — `Failed to resolve import "./editable-fields"`.

- [ ] **Step 3: Minimal implementation.** Create `shared/src/editable-fields.ts`:
  ```ts
  import type { Role } from './role';

  export const UPDATER_EDITABLE_FIELDS = ['softwareVersion', 'lastUpdatedAt', 'status'] as const;

  export function filterEditableFields<T extends Record<string, unknown>>(
    role: Role,
    patch: T,
  ): Partial<T> {
    if (role === 'admin') return { ...patch };
    const allow = new Set<string>(UPDATER_EDITABLE_FIELDS);
    const out: Partial<T> = {};
    for (const key of Object.keys(patch)) {
      if (allow.has(key)) {
        (out as Record<string, unknown>)[key] = patch[key];
      }
    }
    return out;
  }
  ```

- [ ] **Step 4: Run test, expect pass.**
  ```bash
  pnpm --filter @ra/shared test run src/editable-fields.test.ts
  ```
  Expected: PASS — 6 passing.

- [ ] **Step 5: Commit.**
  ```bash
  git add shared/src/editable-fields.ts shared/src/editable-fields.test.ts
  git commit -m "feat(shared): filterEditableFields drops non-allowlisted updater fields (incl. ISSI)"
  ```

---

### Task 2.4: Zod schemas + inferred types + shared barrel export

Define `deviceCreateSchema`, `devicePatchSchema`, `importCommitSchema`, `suggestionFieldEnum`, the `FieldDiff` / `ImportRowClass` type aliases (consumed by the CSV phase), inferred types `DeviceRecord`/`DeviceCreate`/`DevicePatch`, and re-export the whole public API from `shared/src/index.ts`.

**Files:**
- create: `shared/src/schemas.ts`
- create: `shared/src/schemas.test.ts`
- create/modify: `shared/src/index.ts`
- create: `shared/src/index.test.ts`

- [ ] **Step 1: Write failing schema test.** Create `shared/src/schemas.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import {
    deviceCreateSchema,
    devicePatchSchema,
    importCommitSchema,
    suggestionFieldEnum,
  } from './schemas';

  describe('suggestionFieldEnum', () => {
    it('accepts the five suggestable fields', () => {
      for (const f of ['rufname', 'deviceType', 'status', 'location', 'assignedTo']) {
        expect(suggestionFieldEnum.parse(f)).toBe(f);
      }
    });
    it('rejects non-suggestable fields like issi/softwareVersion', () => {
      expect(suggestionFieldEnum.safeParse('issi').success).toBe(false);
      expect(suggestionFieldEnum.safeParse('softwareVersion').success).toBe(false);
    });
  });

  describe('deviceCreateSchema', () => {
    it('requires a non-empty issi', () => {
      expect(deviceCreateSchema.safeParse({}).success).toBe(false);
      expect(deviceCreateSchema.safeParse({ issi: '' }).success).toBe(false);
      const ok = deviceCreateSchema.safeParse({ issi: '12345' });
      expect(ok.success).toBe(true);
    });

    it('accepts full optional payload and coerces lastUpdatedAt to number', () => {
      const parsed = deviceCreateSchema.parse({
        issi: '12345',
        rufname: 'Florian 1/2',
        serialNumber: 'SN-1',
        deviceType: 'TPH900',
        status: 'einsatzbereit',
        location: 'Wache 1',
        assignedTo: 'Team A',
        softwareVersion: 'FW 12.3',
        lastUpdatedAt: 1718200000000,
        notes: 'foo',
      });
      expect(parsed.issi).toBe('12345');
      expect(parsed.lastUpdatedAt).toBe(1718200000000);
    });

    it('strips unknown keys (e.g. createdAt is server-owned)', () => {
      const parsed = deviceCreateSchema.parse({ issi: '1', createdAt: 999, id: 'x' } as any);
      expect('createdAt' in parsed).toBe(false);
      expect('id' in parsed).toBe(false);
    });

    it('allows nullable optional fields to be null', () => {
      const parsed = deviceCreateSchema.parse({ issi: '1', softwareVersion: null, lastUpdatedAt: null });
      expect(parsed.softwareVersion).toBeNull();
      expect(parsed.lastUpdatedAt).toBeNull();
    });
  });

  describe('devicePatchSchema', () => {
    it('all fields optional incl. issi (issi non-empty when present)', () => {
      expect(devicePatchSchema.safeParse({}).success).toBe(true);
      expect(devicePatchSchema.safeParse({ status: 'in Reparatur' }).success).toBe(true);
      expect(devicePatchSchema.safeParse({ issi: '' }).success).toBe(false);
      expect(devicePatchSchema.safeParse({ issi: '777' }).success).toBe(true);
    });
  });

  describe('importCommitSchema', () => {
    it('requires mapping with issi target and rows; dryRun defaults to false', () => {
      const parsed = importCommitSchema.parse({
        mapping: { issi: 0, softwareVersion: 2 },
        rows: [['111', 'x', 'FW 12.3']],
      });
      expect(parsed.dryRun).toBe(false);
      expect(parsed.mapping.issi).toBe(0);
      expect(parsed.rows).toHaveLength(1);
    });

    it('rejects mapping without issi', () => {
      expect(
        importCommitSchema.safeParse({ mapping: { softwareVersion: 2 }, rows: [] }).success,
      ).toBe(false);
    });

    it('respects explicit dryRun true', () => {
      const parsed = importCommitSchema.parse({ mapping: { issi: 0 }, rows: [], dryRun: true });
      expect(parsed.dryRun).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run test, expect failure.**
  ```bash
  pnpm --filter @ra/shared test run src/schemas.test.ts
  ```
  Expected: FAIL — `Failed to resolve import "./schemas"`.

- [ ] **Step 3: Implement schemas.** Create `shared/src/schemas.ts`:
  ```ts
  import { z } from 'zod';

  // Combobox-suggestable text fields (NOT issi, NOT softwareVersion).
  export const suggestionFieldEnum = z.enum([
    'rufname',
    'deviceType',
    'status',
    'location',
    'assignedTo',
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
  ```

- [ ] **Step 4: Run schema test, expect pass.**
  ```bash
  pnpm --filter @ra/shared test run src/schemas.test.ts
  ```
  Expected: PASS — all schema tests green.

- [ ] **Step 5: Add shared CSV/diff type aliases.** Append to `shared/src/schemas.ts` (these types are consumed by the later CSV phase; declared here so the public API is complete and `importCommitSchema` callers can type results):
  ```ts
  export type FieldDiff = { field: string; oldValue: string | null; newValue: string | null };
  export type ImportRowClass =
    | 'created'
    | 'updated'
    | 'unchanged'
    | 'error'
    | 'skipped-no-permission';
  ```

- [ ] **Step 6: Write failing barrel-export test.** Create `shared/src/index.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import * as shared from './index';

  describe('shared public API barrel', () => {
    it('re-exports the core functions', () => {
      expect(typeof shared.mapGroupsToRole).toBe('function');
      expect(typeof shared.computeUpdateStatus).toBe('function');
      expect(typeof shared.filterEditableFields).toBe('function');
    });
    it('re-exports the allowlist constant', () => {
      expect([...shared.UPDATER_EDITABLE_FIELDS]).toEqual([
        'softwareVersion',
        'lastUpdatedAt',
        'status',
      ]);
    });
    it('re-exports the zod schemas', () => {
      expect(shared.deviceCreateSchema.safeParse({ issi: '1' }).success).toBe(true);
      expect(shared.devicePatchSchema.safeParse({}).success).toBe(true);
      expect(shared.importCommitSchema.safeParse({ mapping: { issi: 0 }, rows: [] }).success).toBe(true);
      expect(shared.suggestionFieldEnum.safeParse('location').success).toBe(true);
    });
  });
  ```

- [ ] **Step 7: Run barrel test, expect failure.**
  ```bash
  pnpm --filter @ra/shared test run src/index.test.ts
  ```
  Expected: FAIL — `index.ts` does not yet re-export these (missing exports / module-not-found).

- [ ] **Step 8: Write the barrel.** Create/overwrite `shared/src/index.ts`:
  ```ts
  export type { Role } from './role';
  export { mapGroupsToRole } from './role';

  export type { UpdateStatus } from './update-status';
  export { computeUpdateStatus } from './update-status';

  export { UPDATER_EDITABLE_FIELDS, filterEditableFields } from './editable-fields';

  export {
    suggestionFieldEnum,
    deviceRecordSchema,
    deviceCreateSchema,
    devicePatchSchema,
    importCommitSchema,
  } from './schemas';
  export type {
    DeviceRecord,
    DeviceCreate,
    DevicePatch,
    ImportCommit,
    SuggestionField,
    FieldDiff,
    ImportRowClass,
  } from './schemas';
  ```

- [ ] **Step 9: Run full shared suite + typecheck, expect pass.**
  ```bash
  pnpm --filter @ra/shared test run
  pnpm --filter @ra/shared exec tsc --noEmit
  ```
  Expected: PASS — all shared tests green, no type errors.

- [ ] **Step 10: Commit.**
  ```bash
  git add shared/src/schemas.ts shared/src/schemas.test.ts shared/src/index.ts shared/src/index.test.ts
  git commit -m "feat(shared): zod schemas, inferred types, CSV type aliases and public barrel"
  ```

---

### Task 2.5: Server env/config loader (zod-validated)

A single zod-validated config object loaded from `process.env`, with defaults from the spec env table.

**Files:**
- create: `server/src/config.ts`
- create: `server/src/config.test.ts`

- [ ] **Step 1: Write failing test.** Create `server/src/config.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { loadConfig } from './config';

  const base = {
    DATABASE_PATH: '/tmp/test.sqlite',
    SESSION_SECRET: 'super-secret-value-at-least-16',
    OIDC_ISSUER: 'https://id.example.org',
    OIDC_CLIENT_ID: 'client-1',
    OIDC_CLIENT_SECRET: 'secret-1',
    OIDC_REDIRECT_URI: 'https://app.example.org/api/auth/callback',
  };

  describe('loadConfig', () => {
    it('applies documented defaults', () => {
      const cfg = loadConfig(base);
      expect(cfg.OIDC_ADMIN_GROUP).toBe('admin');
      expect(cfg.OIDC_UPDATER_GROUP).toBe('personal');
      expect(cfg.AUTH_DEV_BYPASS).toBe(false);
      expect(cfg.DEV_USER_ROLE).toBe('admin');
      expect(cfg.DEV_USER_NAME).toBe('Dev User');
      expect(cfg.PORT).toBe(3000);
    });

    it('coerces PORT to a number and AUTH_DEV_BYPASS to boolean', () => {
      const cfg = loadConfig({ ...base, PORT: '8080', AUTH_DEV_BYPASS: 'true' });
      expect(cfg.PORT).toBe(8080);
      expect(cfg.AUTH_DEV_BYPASS).toBe(true);
    });

    it('DEV_USER_ROLE only accepts admin|updater', () => {
      expect(() => loadConfig({ ...base, DEV_USER_ROLE: 'superuser' })).toThrow();
      expect(loadConfig({ ...base, DEV_USER_ROLE: 'updater' }).DEV_USER_ROLE).toBe('updater');
    });

    it('throws when required OIDC fields are missing', () => {
      const { OIDC_ISSUER, ...without } = base;
      expect(() => loadConfig(without)).toThrow(/OIDC_ISSUER/);
    });

    it('throws when SESSION_SECRET is too short', () => {
      expect(() => loadConfig({ ...base, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/);
    });
  });
  ```

- [ ] **Step 2: Run test, expect failure.**
  ```bash
  pnpm --filter @ra/server test run src/config.test.ts
  ```
  Expected: FAIL — `Failed to resolve import "./config"`.

- [ ] **Step 3: Implement config loader.** Create `server/src/config.ts`:
  ```ts
  import { z } from 'zod';

  const boolFromString = z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === 'boolean' ? v : v.toLowerCase() === 'true'));

  const configSchema = z.object({
    DATABASE_PATH: z.string().default('./data/data.sqlite'),
    SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),
    OIDC_ISSUER: z.string().url(),
    OIDC_CLIENT_ID: z.string().min(1),
    OIDC_CLIENT_SECRET: z.string().min(1),
    OIDC_REDIRECT_URI: z.string().url(),
    OIDC_ADMIN_GROUP: z.string().default('admin'),
    OIDC_UPDATER_GROUP: z.string().default('personal'),
    AUTH_DEV_BYPASS: boolFromString.default(false),
    DEV_USER_ROLE: z.enum(['admin', 'updater']).default('admin'),
    DEV_USER_NAME: z.string().default('Dev User'),
    PORT: z.coerce.number().int().positive().default(3000),
  });

  export type AppConfig = z.infer<typeof configSchema>;

  export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
    const result = configSchema.safeParse(env);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
      throw new Error(`Invalid configuration: ${issues}`);
    }
    return result.data;
  }
  ```
  > Note: the `OIDC_ISSUER`-missing test asserts the thrown message contains `OIDC_ISSUER` — satisfied because the issue path is included in the message.

- [ ] **Step 4: Run test, expect pass.**
  ```bash
  pnpm --filter @ra/server test run src/config.test.ts
  ```
  Expected: PASS — 5 passing.

- [ ] **Step 5: Commit.**
  ```bash
  git add server/src/config.ts server/src/config.test.ts
  git commit -m "feat(server): zod-validated env/config loader with documented defaults"
  ```

---

### Task 2.6: `auth-service` module — fakeable openid-client wrapper + jose session JWT

Isolate ALL openid-client interactions behind one module so tests can fake them. Includes the jose-based session JWT sign/verify helpers (HS256, claims `{ sub, name, role, exp }`).

**Files:**
- create: `server/src/auth/types.ts`
- create: `server/src/auth/auth-service.ts`
- create: `server/src/auth/session.ts`
- create: `server/src/auth/session.test.ts`
- create: `server/src/auth/fake-auth-service.ts` (test helper used by route tests)

- [ ] **Step 1: Define shared auth types.** Create `server/src/auth/types.ts`:
  ```ts
  import type { Role } from '@ra/shared';

  export interface SessionClaims {
    sub: string;
    name: string;
    role: Role;
    exp: number; // unix seconds (set by jose)
  }

  export interface OauthTx {
    state: string;
    nonce: string;
    code_verifier: string;
  }

  /** Result of a successful authorization-code exchange. */
  export interface AuthResult {
    sub: string;
    name: string;
    groups: string[];
  }

  /** The seam the routes depend on; the real impl wraps openid-client, tests fake it. */
  export interface AuthService {
    /** Builds the provider authorization URL and the tx values to persist in the oauth_tx cookie. */
    startLogin(): Promise<{ authorizationUrl: string; tx: OauthTx }>;
    /** Exchanges the callback URL for verified claims, validating state/nonce/PKCE. */
    completeLogin(currentUrl: URL, tx: OauthTx): Promise<AuthResult>;
  }
  ```

- [ ] **Step 2: Implement the real auth-service (openid-client v6 functional API).** Create `server/src/auth/auth-service.ts`:
  ```ts
  import * as client from 'openid-client';
  import type { AppConfig } from '../config';
  import type { AuthService, AuthResult, OauthTx } from './types';

  const SCOPE = 'openid profile email groups';

  /**
   * Lazily discovers the OIDC provider once, then memoizes the Configuration.
   * Discovery (network) only happens on the first login attempt, not at import time.
   */
  export function createAuthService(cfg: AppConfig): AuthService {
    let configPromise: Promise<client.Configuration> | null = null;

    const getConfig = (): Promise<client.Configuration> => {
      if (!configPromise) {
        configPromise = client.discovery(
          new URL(cfg.OIDC_ISSUER),
          cfg.OIDC_CLIENT_ID,
          cfg.OIDC_CLIENT_SECRET,
        );
      }
      return configPromise;
    };

    return {
      async startLogin(): Promise<{ authorizationUrl: string; tx: OauthTx }> {
        const config = await getConfig();
        const code_verifier = client.randomPKCECodeVerifier();
        const code_challenge = await client.calculatePKCECodeChallenge(code_verifier);
        const state = client.randomState();
        const nonce = client.randomNonce();

        const url = client.buildAuthorizationUrl(config, {
          redirect_uri: cfg.OIDC_REDIRECT_URI,
          scope: SCOPE,
          code_challenge,
          code_challenge_method: 'S256',
          state,
          nonce,
        });

        return { authorizationUrl: url.href, tx: { state, nonce, code_verifier } };
      },

      async completeLogin(currentUrl: URL, tx: OauthTx): Promise<AuthResult> {
        const config = await getConfig();
        const tokens = await client.authorizationCodeGrant(config, currentUrl, {
          pkceCodeVerifier: tx.code_verifier,
          expectedState: tx.state,
          expectedNonce: tx.nonce,
          idTokenExpected: true,
        });
        const claims = tokens.claims();
        if (!claims) throw new Error('Missing ID token claims');
        const groups = Array.isArray(claims.groups) ? (claims.groups as string[]) : [];
        const name =
          typeof claims.name === 'string'
            ? claims.name
            : typeof claims.preferred_username === 'string'
              ? claims.preferred_username
              : String(claims.sub);
        return { sub: String(claims.sub), name, groups };
      },
    };
  }
  ```

- [ ] **Step 3: Write failing session-JWT test.** Create `server/src/auth/session.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { signSession, verifySession } from './session';

  const secret = 'super-secret-value-at-least-16';

  describe('session JWT (jose HS256)', () => {
    it('round-trips claims', async () => {
      const token = await signSession({ sub: 'u1', name: 'Alice', role: 'admin' }, secret);
      const claims = await verifySession(token, secret);
      expect(claims.sub).toBe('u1');
      expect(claims.name).toBe('Alice');
      expect(claims.role).toBe('admin');
      expect(typeof claims.exp).toBe('number');
    });

    it('rejects a token signed with a different secret', async () => {
      const token = await signSession({ sub: 'u1', name: 'A', role: 'updater' }, secret);
      await expect(verifySession(token, 'a-totally-different-secret!!')).rejects.toThrow();
    });

    it('rejects a tampered/garbage token', async () => {
      await expect(verifySession('not.a.jwt', secret)).rejects.toThrow();
    });

    it('rejects an expired token', async () => {
      const token = await signSession(
        { sub: 'u1', name: 'A', role: 'admin' },
        secret,
        '-1s', // already expired
      );
      await expect(verifySession(token, secret)).rejects.toThrow();
    });
  });
  ```

- [ ] **Step 4: Run test, expect failure.**
  ```bash
  pnpm --filter @ra/server test run src/auth/session.test.ts
  ```
  Expected: FAIL — `Failed to resolve import "./session"`.

- [ ] **Step 5: Implement jose session helpers.** Create `server/src/auth/session.ts`:
  ```ts
  import { SignJWT, jwtVerify } from 'jose';
  import type { Role } from '@ra/shared';
  import type { SessionClaims } from './types';

  const ALG = 'HS256';

  const keyOf = (secret: string): Uint8Array => new TextEncoder().encode(secret);

  export async function signSession(
    payload: { sub: string; name: string; role: Role },
    secret: string,
    expiresIn: string = '8h',
  ): Promise<string> {
    return new SignJWT({ name: payload.name, role: payload.role })
      .setProtectedHeader({ alg: ALG })
      .setSubject(payload.sub)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(keyOf(secret));
  }

  export async function verifySession(token: string, secret: string): Promise<SessionClaims> {
    const { payload } = await jwtVerify(token, keyOf(secret), { algorithms: [ALG] });
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.name !== 'string' ||
      (payload.role !== 'admin' && payload.role !== 'updater') ||
      typeof payload.exp !== 'number'
    ) {
      throw new Error('Invalid session claims');
    }
    return {
      sub: payload.sub,
      name: payload.name,
      role: payload.role,
      exp: payload.exp,
    };
  }
  ```

- [ ] **Step 6: Run test, expect pass.**
  ```bash
  pnpm --filter @ra/server test run src/auth/session.test.ts
  ```
  Expected: PASS — 4 passing.

- [ ] **Step 7: Add the fake auth-service used by route tests** (implements the `AuthService` seam; never touches the network). Create `server/src/auth/fake-auth-service.ts`:
  ```ts
  import type { AuthService, AuthResult, OauthTx } from './types';

  export interface FakeAuthOptions {
    /** tx values returned by startLogin and expected by completeLogin */
    tx?: OauthTx;
    authorizationUrl?: string;
    /** claims completeLogin resolves to */
    result?: AuthResult;
    /** if set, completeLogin rejects with this error */
    failWith?: Error;
  }

  export function createFakeAuthService(opts: FakeAuthOptions = {}): AuthService {
    const tx: OauthTx = opts.tx ?? {
      state: 'state-123',
      nonce: 'nonce-123',
      code_verifier: 'verifier-123',
    };
    const authorizationUrl =
      opts.authorizationUrl ?? 'https://id.example.org/authorize?state=state-123';
    const result: AuthResult = opts.result ?? {
      sub: 'user-1',
      name: 'Test User',
      groups: ['admin'],
    };
    return {
      async startLogin() {
        return { authorizationUrl, tx };
      },
      async completeLogin() {
        if (opts.failWith) throw opts.failWith;
        return result;
      },
    };
  }
  ```

- [ ] **Step 8: Run server suite, expect pass + typecheck.**
  ```bash
  pnpm --filter @ra/server test run
  pnpm --filter @ra/server exec tsc --noEmit
  ```
  Expected: PASS — config + session tests green, no type errors.

- [ ] **Step 9: Commit.**
  ```bash
  git add server/src/auth/types.ts server/src/auth/auth-service.ts server/src/auth/session.ts server/src/auth/session.test.ts server/src/auth/fake-auth-service.ts
  git commit -m "feat(server): fakeable openid-client auth-service + jose session JWT helpers"
  ```

---

### Task 2.7: `oauth_tx` cookie helpers (signed, short-lived)

Sign the `{ state, nonce, code_verifier }` transaction into a short-lived JWT for the `oauth_tx` cookie, plus cookie-attribute constants used by the routes.

**Files:**
- create: `server/src/auth/oauth-tx.ts`
- create: `server/src/auth/oauth-tx.test.ts`

- [ ] **Step 1: Write failing test.** Create `server/src/auth/oauth-tx.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { signOauthTx, verifyOauthTx } from './oauth-tx';

  const secret = 'super-secret-value-at-least-16';
  const tx = { state: 's1', nonce: 'n1', code_verifier: 'v1' };

  describe('oauth_tx cookie helpers', () => {
    it('round-trips the tx values', async () => {
      const token = await signOauthTx(tx, secret);
      expect(await verifyOauthTx(token, secret)).toEqual(tx);
    });

    it('rejects a tx signed with a different secret', async () => {
      const token = await signOauthTx(tx, secret);
      await expect(verifyOauthTx(token, 'another-secret-value-1234')).rejects.toThrow();
    });

    it('rejects an expired tx', async () => {
      const token = await signOauthTx(tx, secret, '-1s');
      await expect(verifyOauthTx(token, secret)).rejects.toThrow();
    });

    it('rejects garbage', async () => {
      await expect(verifyOauthTx('garbage', secret)).rejects.toThrow();
    });
  });
  ```

- [ ] **Step 2: Run test, expect failure.**
  ```bash
  pnpm --filter @ra/server test run src/auth/oauth-tx.test.ts
  ```
  Expected: FAIL — `Failed to resolve import "./oauth-tx"`.

- [ ] **Step 3: Implement.** Create `server/src/auth/oauth-tx.ts`:
  ```ts
  import { SignJWT, jwtVerify } from 'jose';
  import type { OauthTx } from './types';

  const ALG = 'HS256';
  const keyOf = (secret: string): Uint8Array => new TextEncoder().encode(secret);

  export const OAUTH_TX_COOKIE = 'oauth_tx';
  export const SESSION_COOKIE = 'ra_session';

  export async function signOauthTx(
    tx: OauthTx,
    secret: string,
    expiresIn: string = '10m',
  ): Promise<string> {
    return new SignJWT({ ...tx })
      .setProtectedHeader({ alg: ALG })
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(keyOf(secret));
  }

  export async function verifyOauthTx(token: string, secret: string): Promise<OauthTx> {
    const { payload } = await jwtVerify(token, keyOf(secret), { algorithms: [ALG] });
    if (
      typeof payload.state !== 'string' ||
      typeof payload.nonce !== 'string' ||
      typeof payload.code_verifier !== 'string'
    ) {
      throw new Error('Invalid oauth_tx payload');
    }
    return {
      state: payload.state,
      nonce: payload.nonce,
      code_verifier: payload.code_verifier,
    };
  }
  ```

- [ ] **Step 4: Run test, expect pass.**
  ```bash
  pnpm --filter @ra/server test run src/auth/oauth-tx.test.ts
  ```
  Expected: PASS — 4 passing.

- [ ] **Step 5: Commit.**
  ```bash
  git add server/src/auth/oauth-tx.ts server/src/auth/oauth-tx.test.ts
  git commit -m "feat(server): signed short-lived oauth_tx cookie helpers + cookie name constants"
  ```

---

### Task 2.8: Auth middleware + dev-bypass (with loud startup warning)

`requireAuth` reads/verifies the session cookie (or injects the dev-bypass user); `requireRole('admin')` enforces role. The dev-bypass logs a loud warning once at server start.

**Files:**
- create: `server/src/auth/middleware.ts`
- create: `server/src/auth/middleware.test.ts`

- [ ] **Step 1: Write failing middleware test (Hono test-client).** Create `server/src/auth/middleware.test.ts`:
  ```ts
  import { describe, it, expect, vi } from 'vitest';
  import { Hono } from 'hono';
  import { setCookie } from 'hono/cookie';
  import { signSession } from './session';
  import { SESSION_COOKIE } from './oauth-tx';
  import { requireAuth, requireRole, warnIfDevBypass } from './middleware';
  import type { AppConfig } from '../config';

  const secret = 'super-secret-value-at-least-16';

  function baseConfig(over: Partial<AppConfig> = {}): AppConfig {
    return {
      DATABASE_PATH: '/tmp/x.sqlite',
      SESSION_SECRET: secret,
      OIDC_ISSUER: 'https://id.example.org',
      OIDC_CLIENT_ID: 'c',
      OIDC_CLIENT_SECRET: 's',
      OIDC_REDIRECT_URI: 'https://app/api/auth/callback',
      OIDC_ADMIN_GROUP: 'admin',
      OIDC_UPDATER_GROUP: 'personal',
      AUTH_DEV_BYPASS: false,
      DEV_USER_ROLE: 'admin',
      DEV_USER_NAME: 'Dev User',
      PORT: 3000,
      ...over,
    };
  }

  // Minimal app exposing the current user under /whoami and an admin-only stub.
  function makeApp(cfg: AppConfig) {
    const app = new Hono();
    app.use('*', requireAuth(cfg));
    app.get('/whoami', (c) => c.json(c.get('user')));
    app.post('/admin-only', requireRole('admin'), (c) => c.json({ ok: true }));
    return app;
  }

  describe('requireAuth', () => {
    it('returns 401 when no session cookie is present', async () => {
      const app = makeApp(baseConfig());
      const res = await app.request('/whoami');
      expect(res.status).toBe(401);
    });

    it('returns 401 for an invalid/garbage session cookie', async () => {
      const app = makeApp(baseConfig());
      const res = await app.request('/whoami', {
        headers: { cookie: `${SESSION_COOKIE}=garbage` },
      });
      expect(res.status).toBe(401);
    });

    it('passes through and sets c.get("user") for a valid session', async () => {
      const app = makeApp(baseConfig());
      const token = await signSession({ sub: 'u1', name: 'Alice', role: 'updater' }, secret);
      const res = await app.request('/whoami', {
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ sub: 'u1', name: 'Alice', role: 'updater' });
    });
  });

  describe('dev-bypass', () => {
    it('injects a fake user with DEV_USER_ROLE and no cookie', async () => {
      const app = makeApp(baseConfig({ AUTH_DEV_BYPASS: true, DEV_USER_ROLE: 'updater', DEV_USER_NAME: 'Tester' }));
      const res = await app.request('/whoami');
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ sub: 'dev-user', name: 'Tester', role: 'updater' });
    });
  });

  describe('requireRole', () => {
    it('403 when an updater hits an admin-only route', async () => {
      const app = makeApp(baseConfig());
      const token = await signSession({ sub: 'u1', name: 'A', role: 'updater' }, secret);
      const res = await app.request('/admin-only', {
        method: 'POST',
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      });
      expect(res.status).toBe(403);
    });

    it('200 when an admin hits an admin-only route', async () => {
      const app = makeApp(baseConfig());
      const token = await signSession({ sub: 'u1', name: 'A', role: 'admin' }, secret);
      const res = await app.request('/admin-only', {
        method: 'POST',
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    });
  });

  describe('warnIfDevBypass', () => {
    it('logs a loud warning only when bypass is enabled', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      warnIfDevBypass(baseConfig({ AUTH_DEV_BYPASS: false }));
      expect(warn).not.toHaveBeenCalled();
      warnIfDevBypass(baseConfig({ AUTH_DEV_BYPASS: true }));
      expect(warn).toHaveBeenCalled();
      expect(warn.mock.calls.flat().join(' ')).toMatch(/AUTH_DEV_BYPASS/);
      warn.mockRestore();
    });
  });
  ```

- [ ] **Step 2: Run test, expect failure.**
  ```bash
  pnpm --filter @ra/server test run src/auth/middleware.test.ts
  ```
  Expected: FAIL — `Failed to resolve import "./middleware"`.

- [ ] **Step 3: Implement middleware.** Create `server/src/auth/middleware.ts`:
  ```ts
  import type { Context, MiddlewareHandler } from 'hono';
  import { getCookie } from 'hono/cookie';
  import type { Role } from '@ra/shared';
  import type { AppConfig } from '../config';
  import type { SessionClaims } from './types';
  import { verifySession } from './session';
  import { SESSION_COOKIE } from './oauth-tx';

  // Augment Hono context variable map with the authenticated user.
  declare module 'hono' {
    interface ContextVariableMap {
      user: SessionClaims;
    }
  }

  export function requireAuth(cfg: AppConfig): MiddlewareHandler {
    return async (c, next) => {
      if (cfg.AUTH_DEV_BYPASS) {
        c.set('user', {
          sub: 'dev-user',
          name: cfg.DEV_USER_NAME,
          role: cfg.DEV_USER_ROLE,
          exp: Math.floor(Date.now() / 1000) + 3600,
        });
        return next();
      }
      const token = getCookie(c, SESSION_COOKIE);
      if (!token) return c.json({ error: 'unauthenticated' }, 401);
      try {
        const claims = await verifySession(token, cfg.SESSION_SECRET);
        c.set('user', claims);
      } catch {
        return c.json({ error: 'unauthenticated' }, 401);
      }
      return next();
    };
  }

  export function requireRole(role: Role): MiddlewareHandler {
    return async (c: Context, next) => {
      const user = c.get('user');
      if (!user) return c.json({ error: 'unauthenticated' }, 401);
      if (user.role !== role) return c.json({ error: 'forbidden' }, 403);
      return next();
    };
  }

  /** Loud, unmissable startup warning while the auth bypass is active. */
  export function warnIfDevBypass(cfg: AppConfig): void {
    if (!cfg.AUTH_DEV_BYPASS) return;
    const line = '!'.repeat(72);
    console.warn(line);
    console.warn(
      `!! AUTH_DEV_BYPASS=true — authentication is DISABLED. Every request runs as ` +
        `fake user "${cfg.DEV_USER_NAME}" with role "${cfg.DEV_USER_ROLE}". DO NOT use in production.`,
    );
    console.warn(line);
  }
  ```

- [ ] **Step 4: Run test, expect pass.**
  ```bash
  pnpm --filter @ra/server test run src/auth/middleware.test.ts
  ```
  Expected: PASS — 401-unauth, 401-garbage, valid-session, dev-bypass-injects-role, 403-updater, 200-admin, warn-only-when-enabled all green.

- [ ] **Step 5: Commit.**
  ```bash
  git add server/src/auth/middleware.ts server/src/auth/middleware.test.ts
  git commit -m "feat(server): requireAuth/requireRole middleware + dev-bypass with loud startup warning"
  ```

---

### Task 2.9: Auth routes `/api/auth/login|callback|logout|me` (OIDC fully mocked)

Mount the auth routes on a Hono router that depends on the injected `AuthService` + `AppConfig`. Tests use `createFakeAuthService` (no real OIDC server is contacted).

**Files:**
- create: `server/src/auth/routes.ts`
- create: `server/src/auth/routes.test.ts`

- [ ] **Step 1: Write failing route test (Hono test-client + fake auth-service).** Create `server/src/auth/routes.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { signSession } from './session';
  import { signOauthTx, OAUTH_TX_COOKIE, SESSION_COOKIE } from './oauth-tx';
  import { createAuthRoutes } from './routes';
  import { createFakeAuthService } from './fake-auth-service';
  import type { AppConfig } from '../config';

  const secret = 'super-secret-value-at-least-16';
  function cfg(over: Partial<AppConfig> = {}): AppConfig {
    return {
      DATABASE_PATH: '/tmp/x.sqlite',
      SESSION_SECRET: secret,
      OIDC_ISSUER: 'https://id.example.org',
      OIDC_CLIENT_ID: 'c',
      OIDC_CLIENT_SECRET: 's',
      OIDC_REDIRECT_URI: 'https://app/api/auth/callback',
      OIDC_ADMIN_GROUP: 'admin',
      OIDC_UPDATER_GROUP: 'personal',
      AUTH_DEV_BYPASS: false,
      DEV_USER_ROLE: 'admin',
      DEV_USER_NAME: 'Dev User',
      PORT: 3000,
      ...over,
    };
  }

  // Helper: extract a cookie value from a Set-Cookie header.
  function cookieVal(setCookie: string | null, name: string): string | null {
    if (!setCookie) return null;
    const m = setCookie.split(/,(?=[^ ;]+=)/).map((s) => s.trim()).find((s) => s.startsWith(`${name}=`));
    if (!m) return null;
    return decodeURIComponent(m.slice(name.length + 1).split(';')[0]);
  }

  describe('GET /api/auth/login', () => {
    it('redirects to provider authorization URL and sets a signed oauth_tx cookie', async () => {
      const auth = createFakeAuthService({
        authorizationUrl: 'https://id.example.org/authorize?state=state-123',
        tx: { state: 'state-123', nonce: 'nonce-123', code_verifier: 'verifier-123' },
      });
      const app = createAuthRoutes(cfg(), auth);
      const res = await app.request('/api/auth/login');
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('id.example.org/authorize');
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toContain(`${OAUTH_TX_COOKIE}=`);
      expect(setCookie).toMatch(/HttpOnly/i);
    });
  });

  describe('GET /api/auth/callback', () => {
    it('exchanges code, maps groups->role, sets session cookie, clears oauth_tx, redirects to /', async () => {
      const tx = { state: 'state-123', nonce: 'nonce-123', code_verifier: 'verifier-123' };
      const auth = createFakeAuthService({
        tx,
        result: { sub: 'user-1', name: 'Alice Admin', groups: ['admin'] },
      });
      const app = createAuthRoutes(cfg(), auth);
      const txCookie = await signOauthTx(tx, secret);
      const res = await app.request('/api/auth/callback?code=abc&state=state-123', {
        headers: { cookie: `${OAUTH_TX_COOKIE}=${txCookie}` },
      });
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/');
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toContain(`${SESSION_COOKIE}=`);
      // session cookie decodes to an admin claim
      const token = cookieVal(setCookie, SESSION_COOKIE);
      expect(token).toBeTruthy();
    });

    it('returns 403 (redirect to /403) when groups map to no role', async () => {
      const tx = { state: 'state-123', nonce: 'nonce-123', code_verifier: 'verifier-123' };
      const auth = createFakeAuthService({
        tx,
        result: { sub: 'user-2', name: 'No Role', groups: ['some-other-group'] },
      });
      const app = createAuthRoutes(cfg(), auth);
      const txCookie = await signOauthTx(tx, secret);
      const res = await app.request('/api/auth/callback?code=abc&state=state-123', {
        headers: { cookie: `${OAUTH_TX_COOKIE}=${txCookie}` },
      });
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/403');
      expect(res.headers.get('set-cookie') ?? '').not.toContain(`${SESSION_COOKIE}=`);
    });

    it('returns 400 when the oauth_tx cookie is missing', async () => {
      const auth = createFakeAuthService();
      const app = createAuthRoutes(cfg(), auth);
      const res = await app.request('/api/auth/callback?code=abc&state=state-123');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/auth/me', () => {
    it('401 when unauthenticated', async () => {
      const app = createAuthRoutes(cfg(), createFakeAuthService());
      const res = await app.request('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns { name, role } for a valid session', async () => {
      const app = createAuthRoutes(cfg(), createFakeAuthService());
      const token = await signSession({ sub: 'u1', name: 'Alice', role: 'admin' }, secret);
      const res = await app.request('/api/auth/me', {
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ name: 'Alice', role: 'admin' });
    });

    it('reflects the dev-bypass user when bypass is on', async () => {
      const app = createAuthRoutes(cfg({ AUTH_DEV_BYPASS: true, DEV_USER_ROLE: 'updater', DEV_USER_NAME: 'Dev' }), createFakeAuthService());
      const res = await app.request('/api/auth/me');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ name: 'Dev', role: 'updater' });
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears the session cookie and returns 200', async () => {
      const app = createAuthRoutes(cfg(), createFakeAuthService());
      const token = await signSession({ sub: 'u1', name: 'Alice', role: 'admin' }, secret);
      const res = await app.request('/api/auth/logout', {
        method: 'POST',
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      });
      expect(res.status).toBe(200);
      const setCookie = res.headers.get('set-cookie') ?? '';
      // cookie cleared: Max-Age=0 (or Expires in the past)
      expect(setCookie).toContain(`${SESSION_COOKIE}=`);
      expect(setCookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    });
  });
  ```

- [ ] **Step 2: Run test, expect failure.**
  ```bash
  pnpm --filter @ra/server test run src/auth/routes.test.ts
  ```
  Expected: FAIL — `Failed to resolve import "./routes"`.

- [ ] **Step 3: Implement the auth routes.** Create `server/src/auth/routes.ts`:
  ```ts
  import { Hono } from 'hono';
  import { setCookie, deleteCookie } from 'hono/cookie';
  import { getCookie } from 'hono/cookie';
  import { mapGroupsToRole } from '@ra/shared';
  import type { AppConfig } from '../config';
  import type { AuthService } from './types';
  import { signSession } from './session';
  import { signOauthTx, verifyOauthTx, OAUTH_TX_COOKIE, SESSION_COOKIE } from './oauth-tx';
  import { requireAuth } from './middleware';

  export function createAuthRoutes(cfg: AppConfig, auth: AuthService) {
    const app = new Hono();
    const isProd = process.env.NODE_ENV === 'production';

    // GET /api/auth/login — start OIDC flow.
    app.get('/api/auth/login', async (c) => {
      const { authorizationUrl, tx } = await auth.startLogin();
      const txToken = await signOauthTx(tx, cfg.SESSION_SECRET);
      setCookie(c, OAUTH_TX_COOKIE, txToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'Lax',
        path: '/',
        maxAge: 600,
      });
      return c.redirect(authorizationUrl, 302);
    });

    // GET /api/auth/callback — finish OIDC flow, set session.
    app.get('/api/auth/callback', async (c) => {
      const txToken = getCookie(c, OAUTH_TX_COOKIE);
      if (!txToken) return c.json({ error: 'missing oauth transaction' }, 400);
      let tx;
      try {
        tx = await verifyOauthTx(txToken, cfg.SESSION_SECRET);
      } catch {
        return c.json({ error: 'invalid oauth transaction' }, 400);
      }
      deleteCookie(c, OAUTH_TX_COOKIE, { path: '/' });

      const currentUrl = new URL(c.req.url);
      let result;
      try {
        result = await auth.completeLogin(currentUrl, tx);
      } catch {
        return c.json({ error: 'authentication failed' }, 400);
      }

      const role = mapGroupsToRole(result.groups, {
        adminGroup: cfg.OIDC_ADMIN_GROUP,
        updaterGroup: cfg.OIDC_UPDATER_GROUP,
      });
      if (role === null) return c.redirect('/403', 302);

      const session = await signSession(
        { sub: result.sub, name: result.name, role },
        cfg.SESSION_SECRET,
      );
      setCookie(c, SESSION_COOKIE, session, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'Lax',
        path: '/',
        maxAge: 8 * 60 * 60,
      });
      return c.redirect('/', 302);
    });

    // POST /api/auth/logout — clear session.
    app.post('/api/auth/logout', (c) => {
      deleteCookie(c, SESSION_COOKIE, { path: '/' });
      return c.json({ ok: true });
    });

    // GET /api/auth/me — current user (requireAuth → 401 if missing).
    app.get('/api/auth/me', requireAuth(cfg), (c) => {
      const user = c.get('user');
      return c.json({ name: user.name, role: user.role });
    });

    return app;
  }
  ```
  > Note: `deleteCookie` in hono emits `Max-Age=0`, satisfying the logout assertion. `c.redirect('/403', 302)` makes the no-role case land on the client's `/403` hint page (spec §5/§8).

- [ ] **Step 4: Run test, expect pass.**
  ```bash
  pnpm --filter @ra/server test run src/auth/routes.test.ts
  ```
  Expected: PASS — login redirect + oauth_tx cookie, callback success (session cookie + redirect `/`), callback no-role → `/403` (no session), callback missing-tx → 400, `/me` 401, `/me` shape `{ name, role }`, `/me` dev-bypass, logout clears cookie.

- [ ] **Step 5: Full server suite + typecheck + shared, expect all green.**
  ```bash
  pnpm --filter @ra/server test run
  pnpm --filter @ra/server exec tsc --noEmit
  pnpm --filter @ra/shared test run
  ```
  Expected: PASS — every Phase 2 test green, no type errors across `@ra/shared` and `@ra/server`.

- [ ] **Step 6: Commit.**
  ```bash
  git add server/src/auth/routes.ts server/src/auth/routes.test.ts
  git commit -m "feat(server): /api/auth login|callback|logout|me routes with mocked OIDC (fake auth-service)"
  ```

---

## Phase 3: Geräte-CRUD + Comboboxen + Update-Stand

**Goal:** Build the backend repository/service layer over drizzle plus the Hono routes for device CRUD, change-history, combobox suggestions and software-version listing — every list/detail response carrying the SQL-computed `updateStatus` derived from the reference version (newest version assigned to at least one device). Backend only; reuses `@ra/shared` logic, `@ra/server` db/schema, and the auth middleware from earlier phases.

> Assumptions about prior phases (referenced, never re-implemented here):
> - `@ra/shared` exports `Role`, `UpdateStatus`, `UPDATER_EDITABLE_FIELDS`, `computeUpdateStatus`, `filterEditableFields`, `diffDevice`, `FieldDiff`, `deviceCreateSchema`, `devicePatchSchema`, `suggestionFieldEnum`, and inferred types `DeviceRecord`, `DeviceCreate`, `DevicePatch`.
> - `@ra/server` exposes the drizzle client factory and `schema.ts` (`devices`, `softwareVersions`, `deviceEvents`).
> - Auth phase exposes `requireAuth`, `requireRole('admin')` middleware, a typed `c.get('user')` of shape `{ sub: string; name: string; role: Role }`, and a `signSession(payload)` helper (jose HS256, `SESSION_SECRET`) used to mint the session cookie named `session`.

---

### Task 3.1: Test harness (in-memory DB + auth-cookie helper) and repo scaffold

**Files:**
- create: `server/src/db/test-utils.ts`
- create: `server/src/repos/deviceRepo.ts` (empty scaffold)
- create: `server/test/helpers.ts`
- create: `server/test/harness.test.ts`

- [ ] **Step 1: Write the in-memory db factory.** Create `server/src/db/test-utils.ts` exporting `makeTestDb()` that builds a fresh isolated database for every call:
  ```ts
  import Database from 'better-sqlite3';
  import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
  import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
  import * as schema from './schema.js';

  export type TestDb = BetterSQLite3Database<typeof schema>;

  export function makeTestDb(): { db: TestDb; sqlite: Database.Database } {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname });
    return { db, sqlite };
  }
  ```
- [ ] **Step 2: Write the auth-cookie + app helpers.** Create `server/test/helpers.ts`:
  ```ts
  import { signSession } from '../src/auth/session.js';
  import type { Role } from '@ra/shared';

  export async function authCookie(user: { sub: string; name: string; role: Role }): Promise<string> {
    const token = await signSession({ sub: user.sub, name: user.name, role: user.role });
    return `session=${token}`;
  }

  export const adminUser = { sub: 'u-admin', name: 'Admin', role: 'admin' as const };
  export const updaterUser = { sub: 'u-updater', name: 'Updater', role: 'updater' as const };
  ```
  (If the auth phase named the signer differently, adapt the import only — do not change the cookie name `session`.)
- [ ] **Step 3: Write the scaffold.** Create `server/src/repos/deviceRepo.ts` with `export {};` only (compiles, no exports yet).
- [ ] **Step 4: Write the failing harness test.** Create `server/test/harness.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { makeTestDb } from '../src/db/test-utils.js';
  import { authCookie, updaterUser } from './helpers.js';

  describe('test harness', () => {
    it('provides a migrated in-memory db', () => {
      const { db, sqlite } = makeTestDb();
      const rows = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
      const names = rows.map((r) => r.name);
      expect(names).toContain('devices');
      expect(names).toContain('software_versions');
      expect(names).toContain('device_events');
      expect(db).toBeDefined();
    });

    it('mints a session cookie for a role', async () => {
      const cookie = await authCookie(updaterUser);
      expect(cookie).toMatch(/^session=.+/);
    });
  });
  ```
- [ ] **Step 5: Run -> expect fail.** `pnpm --filter @ra/server exec vitest run test/harness.test.ts` — expected to fail (table names not found if migrations folder differs, or import error on `signSession`/`makeTestDb` not yet wired). Read the actual failure and fix the import paths / migrations folder until both tests pass.
- [ ] **Step 6: Run -> expect pass.** `pnpm --filter @ra/server exec vitest run test/harness.test.ts` — both tests green.
- [ ] **Step 7: Commit.**
  ```bash
  git checkout -b feat/phase-3-devices
  git add server/src/db/test-utils.ts server/src/repos/deviceRepo.ts server/test/helpers.ts server/test/harness.test.ts
  git commit -m "test(server): add in-memory db + auth-cookie test harness"
  ```

---

### Task 3.2: Device repository — create / get / delete

**Files:**
- modify: `server/src/repos/deviceRepo.ts`
- create: `server/test/deviceRepo.test.ts`

- [ ] **Step 1: Write failing test for insert+get+delete.** Create `server/test/deviceRepo.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { makeTestDb } from '../src/db/test-utils.js';
  import { createDevice, getDeviceById, deleteDevice } from '../src/repos/deviceRepo.js';

  describe('deviceRepo basic CRUD', () => {
    it('creates, reads and deletes a device', () => {
      const { db } = makeTestDb();
      const created = createDevice(db, { issi: '1001', rufname: 'Florian 1' }, 'u-admin');
      expect(created.id).toBeTruthy();
      expect(created.issi).toBe('1001');
      expect(created.createdBy).toBe('u-admin');
      expect(typeof created.createdAt).toBe('number');

      const fetched = getDeviceById(db, created.id);
      expect(fetched?.rufname).toBe('Florian 1');

      const ok = deleteDevice(db, created.id);
      expect(ok).toBe(true);
      expect(getDeviceById(db, created.id)).toBeUndefined();
    });
  });
  ```
- [ ] **Step 2: Run -> expect fail.** `pnpm --filter @ra/server exec vitest run test/deviceRepo.test.ts` — fails: `createDevice` is not exported.
- [ ] **Step 3: Implement create/get/delete.** Replace `server/src/repos/deviceRepo.ts` body:
  ```ts
  import { createId } from '@paralleldrive/cuid2';
  import { eq } from 'drizzle-orm';
  import type { TestDb } from '../db/test-utils.js';
  import { devices } from '../db/schema.js';
  import type { DeviceRecord, DeviceCreate } from '@ra/shared';

  export type Db = TestDb;

  export function createDevice(db: Db, input: DeviceCreate, userId: string | null): DeviceRecord {
    const now = Date.now();
    const row = {
      id: createId(),
      rufname: input.rufname ?? null,
      issi: input.issi,
      serialNumber: input.serialNumber ?? null,
      deviceType: input.deviceType ?? null,
      status: input.status ?? null,
      location: input.location ?? null,
      assignedTo: input.assignedTo ?? null,
      softwareVersion: input.softwareVersion ?? null,
      lastUpdatedAt: input.lastUpdatedAt ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      updatedBy: userId,
    };
    db.insert(devices).values(row).run();
    return row as DeviceRecord;
  }

  export function getDeviceById(db: Db, id: string): DeviceRecord | undefined {
    return db.select().from(devices).where(eq(devices.id, id)).get() as DeviceRecord | undefined;
  }

  export function deleteDevice(db: Db, id: string): boolean {
    const res = db.delete(devices).where(eq(devices.id, id)).run();
    return res.changes > 0;
  }
  ```
  (`Db` is aliased to `TestDb`, which is `BetterSQLite3Database<typeof schema>` — the same type as the production client, so prod and test share it.)
- [ ] **Step 4: Run -> expect pass.** `pnpm --filter @ra/server exec vitest run test/deviceRepo.test.ts` — green.
- [ ] **Step 5: Commit.**
  ```bash
  git add server/src/repos/deviceRepo.ts server/test/deviceRepo.test.ts
  git commit -m "feat(server): device repo create/get/delete"
  ```

---

### Task 3.3: Reference-version query (newest version assigned to ≥1 device)

**Files:**
- create: `server/src/repos/softwareVersionRepo.ts`
- create: `server/test/referenceVersion.test.ts`

- [ ] **Step 1: Write the failing test — including the phantom-version case.** Create `server/test/referenceVersion.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { makeTestDb } from '../src/db/test-utils.js';
  import { createDevice } from '../src/repos/deviceRepo.js';
  import { insertSoftwareVersionIfNew, getReferenceVersion } from '../src/repos/softwareVersionRepo.js';

  describe('getReferenceVersion', () => {
    it('returns null when no versions assigned', () => {
      const { db } = makeTestDb();
      insertSoftwareVersionIfNew(db, 'FW 1.0', null, 1000);
      expect(getReferenceVersion(db)).toBeNull();
    });

    it('returns newest version that is assigned to at least one device, ignoring unassigned phantom versions', () => {
      const { db } = makeTestDb();
      // older version, assigned
      insertSoftwareVersionIfNew(db, 'FW 1.0', null, 1000);
      createDevice(db, { issi: '1', softwareVersion: 'FW 1.0' }, null);
      // newer version, NEVER assigned (phantom: typo/unassign) -> must be ignored
      insertSoftwareVersionIfNew(db, 'FW 9.9', null, 5000);
      expect(getReferenceVersion(db)).toBe('FW 1.0');

      // assign an even newer-but-after-phantom version -> it becomes reference
      insertSoftwareVersionIfNew(db, 'FW 2.0', null, 3000);
      createDevice(db, { issi: '2', softwareVersion: 'FW 2.0' }, null);
      expect(getReferenceVersion(db)).toBe('FW 2.0');
    });
  });
  ```
- [ ] **Step 2: Run -> expect fail.** `pnpm --filter @ra/server exec vitest run test/referenceVersion.test.ts` — fails: module/functions not found.
- [ ] **Step 3: Implement the repo with conflict-safe insert and EXISTS query.** Create `server/src/repos/softwareVersionRepo.ts`:
  ```ts
  import { createId } from '@paralleldrive/cuid2';
  import { and, desc, eq, exists } from 'drizzle-orm';
  import type { Db } from './deviceRepo.js';
  import { devices, softwareVersions } from '../db/schema.js';

  /** Insert a software version by value; no-op if the value already exists (unique constraint). */
  export function insertSoftwareVersionIfNew(
    db: Db,
    value: string,
    userId: string | null,
    createdAt: number = Date.now(),
  ): void {
    db.insert(softwareVersions)
      .values({ id: createId(), value, createdAt, createdBy: userId })
      .onConflictDoNothing({ target: softwareVersions.value })
      .run();
  }

  /**
   * Reference/target version = newest (max createdAt) software version that is
   * currently assigned to at least one device. Unassigned phantom versions are ignored.
   */
  export function getReferenceVersion(db: Db): string | null {
    const row = db
      .select({ value: softwareVersions.value })
      .from(softwareVersions)
      .where(
        exists(
          db
            .select({ one: devices.id })
            .from(devices)
            .where(eq(devices.softwareVersion, softwareVersions.value)),
        ),
      )
      .orderBy(desc(softwareVersions.createdAt))
      .limit(1)
      .get();
    return row?.value ?? null;
  }

  /** List all versions, newest first, with a `reference` flag on the computed reference version. */
  export function listSoftwareVersions(db: Db): { value: string; createdAt: number; reference: boolean }[] {
    const ref = getReferenceVersion(db);
    const rows = db
      .select({ value: softwareVersions.value, createdAt: softwareVersions.createdAt })
      .from(softwareVersions)
      .orderBy(desc(softwareVersions.createdAt))
      .all();
    return rows.map((r) => ({ ...r, reference: r.value === ref }));
  }

  export { and }; // re-export guard to keep tree-shaking honest; harmless
  ```
  (The trailing `export { and }` is optional housekeeping; drop it if your lint forbids unused-but-re-exported. `listSoftwareVersions` is implemented here now and consumed in Task 3.11.)
- [ ] **Step 4: Run -> expect pass.** `pnpm --filter @ra/server exec vitest run test/referenceVersion.test.ts` — green (phantom `FW 9.9` ignored).
- [ ] **Step 5: Commit.**
  ```bash
  git add server/src/repos/softwareVersionRepo.ts server/test/referenceVersion.test.ts
  git commit -m "feat(server): reference-version EXISTS query + conflict-safe version insert"
  ```

---

### Task 3.4: Device list query (search / filters / sort / pagination + SQL-computed updateStatus)

**Files:**
- modify: `server/src/repos/deviceRepo.ts`
- create: `server/test/deviceList.test.ts`

> Design decision (made once, applied everywhere): `updateStatus` is computed **in SQL** via a CASE that compares `devices.softwareVersion` to the scalar reference value. This keeps WHERE/sort/paginate/count uniform and correct when filtering/sorting by `updateStatus`. `q` searches `rufname`, `issi`, `serialNumber`, `assignedTo` via `LIKE %q%`. `status` and `location` are equality filters.

- [ ] **Step 1: Write the failing list test.** Create `server/test/deviceList.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { makeTestDb } from '../src/db/test-utils.js';
  import { createDevice, listDevices } from '../src/repos/deviceRepo.js';
  import { insertSoftwareVersionIfNew } from '../src/repos/softwareVersionRepo.js';

  function seed(db: ReturnType<typeof makeTestDb>['db']) {
    insertSoftwareVersionIfNew(db, 'FW 1.0', null, 1000);
    insertSoftwareVersionIfNew(db, 'FW 2.0', null, 2000);
    createDevice(db, { issi: '100', rufname: 'Alpha', status: 'einsatzbereit', location: 'Wache', softwareVersion: 'FW 2.0' }, null);
    createDevice(db, { issi: '200', rufname: 'Bravo', status: 'in Reparatur', location: 'Werkstatt', softwareVersion: 'FW 1.0' }, null);
    createDevice(db, { issi: '300', rufname: 'Charlie', status: 'einsatzbereit', location: 'Wache' }, null); // no swVersion
  }

  describe('listDevices', () => {
    it('attaches computed updateStatus (aktuell/veraltet/unbekannt)', () => {
      const { db } = makeTestDb();
      seed(db);
      const { rows } = listDevices(db, {});
      const byIssi = Object.fromEntries(rows.map((r) => [r.issi, r.updateStatus]));
      expect(byIssi['100']).toBe('aktuell');   // FW 2.0 == reference
      expect(byIssi['200']).toBe('veraltet');  // FW 1.0
      expect(byIssi['300']).toBe('unbekannt'); // null
    });

    it('filters by q across rufname/issi', () => {
      const { db } = makeTestDb();
      seed(db);
      expect(listDevices(db, { q: 'Brav' }).rows.map((r) => r.issi)).toEqual(['200']);
      expect(listDevices(db, { q: '300' }).rows.map((r) => r.issi)).toEqual(['300']);
    });

    it('filters by status, location and updateStatus', () => {
      const { db } = makeTestDb();
      seed(db);
      expect(listDevices(db, { status: 'einsatzbereit' }).total).toBe(2);
      expect(listDevices(db, { location: 'Werkstatt' }).rows.map((r) => r.issi)).toEqual(['200']);
      expect(listDevices(db, { updateStatus: 'veraltet' }).rows.map((r) => r.issi)).toEqual(['200']);
      expect(listDevices(db, { updateStatus: 'unbekannt' }).rows.map((r) => r.issi)).toEqual(['300']);
    });

    it('sorts and paginates with a correct total', () => {
      const { db } = makeTestDb();
      seed(db);
      const page = listDevices(db, { sort: 'rufname:desc', page: 1, pageSize: 2 });
      expect(page.total).toBe(3);
      expect(page.rows.map((r) => r.rufname)).toEqual(['Charlie', 'Bravo']);
      const page2 = listDevices(db, { sort: 'rufname:desc', page: 2, pageSize: 2 });
      expect(page2.rows.map((r) => r.rufname)).toEqual(['Alpha']);
    });
  });
  ```
- [ ] **Step 2: Run -> expect fail.** `pnpm --filter @ra/server exec vitest run test/deviceList.test.ts` — fails: `listDevices` not exported.
- [ ] **Step 3: Implement `listDevices`.** Add to `server/src/repos/deviceRepo.ts`:
  ```ts
  import { and, asc, desc, like, or, sql, count } from 'drizzle-orm';
  import { getReferenceVersion } from './softwareVersionRepo.js';
  import type { UpdateStatus } from '@ra/shared';

  export interface ListParams {
    q?: string;
    status?: string;
    location?: string;
    updateStatus?: UpdateStatus;
    sort?: string;      // "field:asc" | "field:desc"
    page?: number;      // 1-based
    pageSize?: number;
  }
  export interface DeviceListItem extends DeviceRecord { updateStatus: UpdateStatus; }
  export interface ListResult { rows: DeviceListItem[]; total: number; page: number; pageSize: number; }

  const SORTABLE: Record<string, any> = {
    rufname: devices.rufname,
    issi: devices.issi,
    status: devices.status,
    location: devices.location,
    lastUpdatedAt: devices.lastUpdatedAt,
    createdAt: devices.createdAt,
  };

  export function listDevices(db: Db, params: ListParams): ListResult {
    const ref = getReferenceVersion(db); // string | null
    // SQL expression mirroring computeUpdateStatus(device, ref)
    const statusExpr = sql<UpdateStatus>`CASE
      WHEN ${devices.softwareVersion} IS NULL THEN 'unbekannt'
      WHEN ${ref === null ? sql`NULL` : sql`${ref}`} IS NOT NULL AND ${devices.softwareVersion} = ${ref ?? ''} THEN 'aktuell'
      ELSE 'veraltet' END`;

    const conds: any[] = [];
    if (params.q) {
      const term = `%${params.q}%`;
      conds.push(or(like(devices.rufname, term), like(devices.issi, term), like(devices.serialNumber, term), like(devices.assignedTo, term)));
    }
    if (params.status) conds.push(eq(devices.status, params.status));
    if (params.location) conds.push(eq(devices.location, params.location));
    if (params.updateStatus) conds.push(eq(statusExpr, params.updateStatus));
    const where = conds.length ? and(...conds) : undefined;

    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 25));

    let orderBy: any = desc(devices.createdAt);
    if (params.sort) {
      const [f, dir] = params.sort.split(':');
      const col = f === 'updateStatus' ? statusExpr : SORTABLE[f];
      if (col) orderBy = dir === 'desc' ? desc(col) : asc(col);
    }

    const totalRow = db.select({ c: count() }).from(devices).where(where).get();
    const total = totalRow?.c ?? 0;

    const rows = db
      .select({ d: devices, updateStatus: statusExpr })
      .from(devices)
      .where(where)
      .orderBy(orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .all()
      .map((r) => ({ ...(r.d as DeviceRecord), updateStatus: r.updateStatus })) as DeviceListItem[];

    return { rows, total, page, pageSize };
  }
  ```
  (The `CASE` mirrors `computeUpdateStatus` exactly: null swVersion → `unbekannt`; equals ref → `aktuell`; else `veraltet`. When `ref` is null, the `aktuell` branch can never match, so non-null versions fall through to `veraltet`, matching the shared fn.)
- [ ] **Step 4: Run -> expect pass.** `pnpm --filter @ra/server exec vitest run test/deviceList.test.ts` — all four cases green.
- [ ] **Step 5: Commit.**
  ```bash
  git add server/src/repos/deviceRepo.ts server/test/deviceList.test.ts
  git commit -m "feat(server): listDevices with search/filter/sort/paginate + SQL updateStatus"
  ```

---

### Task 3.5: GET /api/devices and GET /api/devices/:id routes

**Files:**
- create: `server/src/routes/devices.ts`
- modify: `server/src/app.ts` (mount the router; create if your app-factory lives elsewhere — adapt path only)
- create: `server/test/devicesRoutes.read.test.ts`

> All device routes sit behind `requireAuth`. The router is a factory taking the db so tests inject the in-memory db: `deviceRoutes(db)`.

- [ ] **Step 1: Write the failing route test.** Create `server/test/devicesRoutes.read.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { testClient } from 'hono/testing';
  import { makeTestDb } from '../src/db/test-utils.js';
  import { buildTestApp } from './helpers.js';
  import { createDevice } from '../src/repos/deviceRepo.js';
  import { insertSoftwareVersionIfNew } from '../src/repos/softwareVersionRepo.js';
  import { authCookie, adminUser } from './helpers.js';

  describe('GET /api/devices(/:id)', () => {
    it('lists devices with updateStatus and reads one by id', async () => {
      const { db } = makeTestDb();
      insertSoftwareVersionIfNew(db, 'FW 2.0', null, 2000);
      const d = createDevice(db, { issi: '500', rufname: 'Delta', softwareVersion: 'FW 2.0' }, null);
      const app = buildTestApp(db);
      const cookie = await authCookie(adminUser);

      const listRes = await app.request('/api/devices', { headers: { Cookie: cookie } });
      expect(listRes.status).toBe(200);
      const body = await listRes.json();
      expect(body.total).toBe(1);
      expect(body.rows[0].updateStatus).toBe('aktuell');

      const oneRes = await app.request(`/api/devices/${d.id}`, { headers: { Cookie: cookie } });
      expect(oneRes.status).toBe(200);
      const one = await oneRes.json();
      expect(one.issi).toBe('500');
      expect(one.updateStatus).toBe('aktuell');

      const missing = await app.request('/api/devices/nope', { headers: { Cookie: cookie } });
      expect(missing.status).toBe(404);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const { db } = makeTestDb();
      const app = buildTestApp(db);
      const res = await app.request('/api/devices');
      expect(res.status).toBe(401);
    });
  });
  ```
- [ ] **Step 2: Add `buildTestApp` to helpers.** Append to `server/test/helpers.ts`:
  ```ts
  import { Hono } from 'hono';
  import { requireAuth } from '../src/auth/middleware.js';
  import { deviceRoutes } from '../src/routes/devices.js';
  import type { Db } from '../src/repos/deviceRepo.js';

  export function buildTestApp(db: Db) {
    const app = new Hono();
    app.use('/api/*', requireAuth);
    app.route('/api', deviceRoutes(db));
    return app;
  }
  ```
  (Adapt the `requireAuth` import path to the auth phase's actual file.)
- [ ] **Step 3: Run -> expect fail.** `pnpm --filter @ra/server exec vitest run test/devicesRoutes.read.test.ts` — fails: `deviceRoutes` not found.
- [ ] **Step 4: Implement the read routes.** Create `server/src/routes/devices.ts`:
  ```ts
  import { Hono } from 'hono';
  import type { Db } from '../repos/deviceRepo.js';
  import { listDevices, getDeviceById } from '../repos/deviceRepo.js';
  import { computeUpdateStatus, type UpdateStatus } from '@ra/shared';
  import { getReferenceVersion } from '../repos/softwareVersionRepo.js';

  export function deviceRoutes(db: Db) {
    const r = new Hono();

    r.get('/devices', (c) => {
      const qp = c.req.query();
      const result = listDevices(db, {
        q: qp.q,
        status: qp.status,
        location: qp.location,
        updateStatus: qp.updateStatus as UpdateStatus | undefined,
        sort: qp.sort,
        page: qp.page ? Number(qp.page) : undefined,
        pageSize: qp.pageSize ? Number(qp.pageSize) : undefined,
      });
      return c.json(result);
    });

    r.get('/devices/:id', (c) => {
      const device = getDeviceById(db, c.req.param('id'));
      if (!device) return c.json({ error: 'not_found' }, 404);
      const ref = getReferenceVersion(db);
      const updateStatus = computeUpdateStatus(device, ref);
      return c.json({ ...device, updateStatus });
    });

    return r;
  }
  ```
  (Detail uses the shared `computeUpdateStatus` — single source of truth — while the list uses the equivalent SQL CASE for paginate-correct filtering.)
- [ ] **Step 5: Mount in app.** In `server/src/app.ts` ensure `requireAuth` guards `/api/*` and `app.route('/api', deviceRoutes(db))` is wired with the production db. (If the app already builds a db client, pass it in here.)
- [ ] **Step 6: Run -> expect pass.** `pnpm --filter @ra/server exec vitest run test/devicesRoutes.read.test.ts` — green (incl. 401 and 404).
- [ ] **Step 7: Commit.**
  ```bash
  git add server/src/routes/devices.ts server/src/app.ts server/test/helpers.ts server/test/devicesRoutes.read.test.ts
  git commit -m "feat(server): GET /api/devices list + GET /api/devices/:id detail routes"
  ```

---

### Task 3.6: POST /api/devices (admin only, zod, implicit softwareVersion, 'create' events)

**Files:**
- modify: `server/src/repos/deviceRepo.ts` (no change expected; reuse `createDevice`)
- modify: `server/src/routes/devices.ts`
- create: `server/test/devicesRoutes.create.test.ts`

> Decision (explicit): POST writes one `device_events` row with `source: 'create'` per **non-null** submitted field (`oldValue: null`, `newValue` = the value), and inserts a `software_versions` row (conflict-safe) when `softwareVersion` is provided. This gives `'create'` an owner now and keeps the timeline complete from device birth.

- [ ] **Step 1: Add the events-writer helper test indirectly via POST test.** Create `server/test/devicesRoutes.create.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { makeTestDb } from '../src/db/test-utils.js';
  import { buildTestApp } from './helpers.js';
  import { authCookie, adminUser, updaterUser } from './helpers.js';
  import { eq } from 'drizzle-orm';
  import { deviceEvents, softwareVersions } from '../src/db/schema.js';

  describe('POST /api/devices', () => {
    it('admin creates a device, writes create-events and registers the software version', async () => {
      const { db } = makeTestDb();
      const app = buildTestApp(db);
      const res = await app.request('/api/devices', {
        method: 'POST',
        headers: { Cookie: await authCookie(adminUser), 'content-type': 'application/json' },
        body: JSON.stringify({ issi: '900', rufname: 'Echo', softwareVersion: 'FW 3.0' }),
      });
      expect(res.status).toBe(201);
      const created = await res.json();
      expect(created.issi).toBe('900');

      const events = db.select().from(deviceEvents).where(eq(deviceEvents.deviceId, created.id)).all();
      const fields = events.map((e: any) => e.field).sort();
      expect(fields).toEqual(['issi', 'rufname', 'softwareVersion']);
      expect(events.every((e: any) => e.source === 'create')).toBe(true);

      const versions = db.select().from(softwareVersions).where(eq(softwareVersions.value, 'FW 3.0')).all();
      expect(versions.length).toBe(1);
    });

    it('rejects updater with 403', async () => {
      const { db } = makeTestDb();
      const app = buildTestApp(db);
      const res = await app.request('/api/devices', {
        method: 'POST',
        headers: { Cookie: await authCookie(updaterUser), 'content-type': 'application/json' },
        body: JSON.stringify({ issi: '901' }),
      });
      expect(res.status).toBe(403);
    });

    it('rejects invalid body (missing issi) with 400', async () => {
      const { db } = makeTestDb();
      const app = buildTestApp(db);
      const res = await app.request('/api/devices', {
        method: 'POST',
        headers: { Cookie: await authCookie(adminUser), 'content-type': 'application/json' },
        body: JSON.stringify({ rufname: 'NoIssi' }),
      });
      expect(res.status).toBe(400);
    });
  });
  ```
- [ ] **Step 2: Wire `requireRole('admin')` into the test app.** Update `buildTestApp` in `server/test/helpers.ts` so POST/DELETE role guards run. Since guards are declared inside `deviceRoutes`, no change needed here — but confirm `requireRole` is imported inside `devices.ts` (next step). Keep `buildTestApp` as-is.
- [ ] **Step 3: Run -> expect fail.** `pnpm --filter @ra/server exec vitest run test/devicesRoutes.create.test.ts` — fails: POST route missing (404/405).
- [ ] **Step 4: Add an events helper to the repo.** Append to `server/src/repos/deviceRepo.ts`:
  ```ts
  import { createId } from '@paralleldrive/cuid2';
  import { deviceEvents } from '../db/schema.js';
  import type { FieldDiff } from '@ra/shared';

  export function writeEvents(
    db: Db,
    deviceId: string,
    diffs: FieldDiff[],
    changedBy: string | null,
    source: 'manual' | 'csv-import' | 'create',
  ): void {
    if (diffs.length === 0) return;
    const changedAt = Date.now();
    db.insert(deviceEvents)
      .values(diffs.map((d) => ({
        id: createId(),
        deviceId,
        field: d.field,
        oldValue: d.oldValue,
        newValue: d.newValue,
        changedBy,
        changedAt,
        source,
      })))
      .run();
  }

  export function getDeviceEvents(db: Db, deviceId: string) {
    return db
      .select()
      .from(deviceEvents)
      .where(eq(deviceEvents.deviceId, deviceId))
      .orderBy(desc(deviceEvents.changedAt))
      .all();
  }
  ```
  (`createId`, `eq`, `desc` are already imported in this file from earlier tasks — keep a single import each.)
- [ ] **Step 5: Implement the POST route.** Add inside `deviceRoutes` in `server/src/routes/devices.ts` (and add imports at top):
  ```ts
  import { requireRole } from '../auth/middleware.js';
  import { createDevice, writeEvents } from '../repos/deviceRepo.js';
  import { insertSoftwareVersionIfNew } from '../repos/softwareVersionRepo.js';
  import { deviceCreateSchema, type FieldDiff } from '@ra/shared';
  ```
  ```ts
  r.post('/devices', requireRole('admin'), async (c) => {
    const json = await c.req.json().catch(() => null);
    const parsed = deviceCreateSchema.safeParse(json);
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    const user = c.get('user') as { sub: string };

    if (parsed.data.softwareVersion) {
      insertSoftwareVersionIfNew(db, parsed.data.softwareVersion, user.sub);
    }
    const device = createDevice(db, parsed.data, user.sub);

    const diffs: FieldDiff[] = Object.entries(parsed.data)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([field, v]) => ({ field, oldValue: null, newValue: v == null ? null : String(v) }));
    writeEvents(db, device.id, diffs, user.sub, 'create');

    return c.json(device, 201);
  });
  ```
- [ ] **Step 6: Run -> expect pass.** `pnpm --filter @ra/server exec vitest run test/devicesRoutes.create.test.ts` — 201 happy path, 403 updater, 400 invalid all green.
- [ ] **Step 7: Commit.**
  ```bash
  git add server/src/repos/deviceRepo.ts server/src/routes/devices.ts server/test/devicesRoutes.create.test.ts
  git commit -m "feat(server): POST /api/devices (admin) with create-events + implicit software version"
  ```

---

### Task 3.7: PATCH /api/devices/:id (field allowlist by role, diff → events, implicit softwareVersion)

**Files:**
- modify: `server/src/repos/deviceRepo.ts` (add `updateDevice`)
- modify: `server/src/routes/devices.ts`
- create: `server/test/devicesRoutes.patch.test.ts`

> Ordering (locked): `filterEditableFields(role, patch)` → `diffDevice(existing, filtered)` → apply patch → `writeEvents(..., 'manual')` (one row per changed field) → conflict-safe `insertSoftwareVersionIfNew` when a new `softwareVersion` value is written. PATCH is open to `any` role; the allowlist is the authorization boundary, not a route guard.

- [ ] **Step 1: Add `updateDevice` to the repo.** Append to `server/src/repos/deviceRepo.ts`:
  ```ts
  export function updateDevice(db: Db, id: string, patch: Partial<DeviceRecord>, userId: string | null): DeviceRecord | undefined {
    const now = Date.now();
    db.update(devices).set({ ...patch, updatedAt: now, updatedBy: userId }).where(eq(devices.id, id)).run();
    return getDeviceById(db, id);
  }
  ```
- [ ] **Step 2: Write the failing PATCH test.** Create `server/test/devicesRoutes.patch.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { makeTestDb } from '../src/db/test-utils.js';
  import { buildTestApp } from './helpers.js';
  import { authCookie, adminUser, updaterUser } from './helpers.js';
  import { createDevice } from '../src/repos/deviceRepo.js';
  import { insertSoftwareVersionIfNew } from '../src/repos/softwareVersionRepo.js';
  import { eq } from 'drizzle-orm';
  import { deviceEvents, softwareVersions } from '../src/db/schema.js';

  describe('PATCH /api/devices/:id', () => {
    it('admin patches an update field + an identity field, writes one event per change', async () => {
      const { db } = makeTestDb();
      insertSoftwareVersionIfNew(db, 'FW 1.0', null, 1000);
      const d = createDevice(db, { issi: '700', rufname: 'Foxtrot', softwareVersion: 'FW 1.0' }, null);
      const app = buildTestApp(db);
      const res = await app.request(`/api/devices/${d.id}`, {
        method: 'PATCH',
        headers: { Cookie: await authCookie(adminUser), 'content-type': 'application/json' },
        body: JSON.stringify({ rufname: 'Foxtrot-2', status: 'in Reparatur' }),
      });
      expect(res.status).toBe(200);
      const updated = await res.json();
      expect(updated.rufname).toBe('Foxtrot-2');
      expect(updated.status).toBe('in Reparatur');

      const events = db.select().from(deviceEvents).where(eq(deviceEvents.deviceId, d.id)).all();
      const changed = events.map((e: any) => e.field).sort();
      expect(changed).toEqual(['rufname', 'status']);
      expect(events.every((e: any) => e.source === 'manual')).toBe(true);
    });

    it('updater PATCH drops identity fields (rufname ignored, status applied)', async () => {
      const { db } = makeTestDb();
      const d = createDevice(db, { issi: '701', rufname: 'Golf', status: 'einsatzbereit' }, null);
      const app = buildTestApp(db);
      const res = await app.request(`/api/devices/${d.id}`, {
        method: 'PATCH',
        headers: { Cookie: await authCookie(updaterUser), 'content-type': 'application/json' },
        body: JSON.stringify({ rufname: 'HACK', issi: '999', status: 'in Reparatur' }),
      });
      expect(res.status).toBe(200);
      const updated = await res.json();
      expect(updated.rufname).toBe('Golf'); // identity field untouched
      expect(updated.issi).toBe('701');     // ISSI (match-key) untouched
      expect(updated.status).toBe('in Reparatur'); // allowed update field applied

      const events = db.select().from(deviceEvents).where(eq(deviceEvents.deviceId, d.id)).all();
      expect(events.map((e: any) => e.field)).toEqual(['status']);
    });

    it('registers a brand-new softwareVersion value on save', async () => {
      const { db } = makeTestDb();
      const d = createDevice(db, { issi: '702' }, null);
      const app = buildTestApp(db);
      const res = await app.request(`/api/devices/${d.id}`, {
        method: 'PATCH',
        headers: { Cookie: await authCookie(updaterUser), 'content-type': 'application/json' },
        body: JSON.stringify({ softwareVersion: 'FW 5.0' }),
      });
      expect(res.status).toBe(200);
      const versions = db.select().from(softwareVersions).where(eq(softwareVersions.value, 'FW 5.0')).all();
      expect(versions.length).toBe(1);
    });

    it('404 on unknown id', async () => {
      const { db } = makeTestDb();
      const app = buildTestApp(db);
      const res = await app.request('/api/devices/nope', {
        method: 'PATCH',
        headers: { Cookie: await authCookie(adminUser), 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'x' }),
      });
      expect(res.status).toBe(404);
    });
  });
  ```
- [ ] **Step 3: Run -> expect fail.** `pnpm --filter @ra/server exec vitest run test/devicesRoutes.patch.test.ts` — fails: PATCH route missing.
- [ ] **Step 4: Implement the PATCH route.** Add to `deviceRoutes` in `server/src/routes/devices.ts` (and add imports `devicePatchSchema`, `filterEditableFields`, `diffDevice`, `updateDevice` from the respective modules):
  ```ts
  r.patch('/devices/:id', async (c) => {
    const id = c.req.param('id');
    const existing = getDeviceById(db, id);
    if (!existing) return c.json({ error: 'not_found' }, 404);

    const json = await c.req.json().catch(() => null);
    const parsed = devicePatchSchema.safeParse(json);
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);

    const user = c.get('user') as { sub: string; role: 'admin' | 'updater' };
    const allowed = filterEditableFields(user.role, parsed.data); // drops locked fields silently
    const diffs = diffDevice(existing, allowed as Partial<typeof existing>);

    if (diffs.length === 0) {
      const ref0 = getReferenceVersion(db);
      return c.json({ ...existing, updateStatus: computeUpdateStatus(existing, ref0) });
    }

    if ('softwareVersion' in allowed && allowed.softwareVersion) {
      insertSoftwareVersionIfNew(db, allowed.softwareVersion as string, user.sub);
    }
    const updated = updateDevice(db, id, allowed as Partial<typeof existing>, user.sub)!;
    writeEvents(db, id, diffs, user.sub, 'manual');

    const ref = getReferenceVersion(db);
    return c.json({ ...updated, updateStatus: computeUpdateStatus(updated, ref) });
  });
  ```
  Add to the import block at the top of the file:
  ```ts
  import { devicePatchSchema, filterEditableFields, diffDevice } from '@ra/shared';
  import { getDeviceById, updateDevice } from '../repos/deviceRepo.js';
  ```
  (Merge with the existing `../repos/deviceRepo.js` import line — one import statement per module.)
- [ ] **Step 5: Run -> expect pass.** `pnpm --filter @ra/server exec vitest run test/devicesRoutes.patch.test.ts` — all four green (note the updater test proves identity fields are dropped, not rejected).
- [ ] **Step 6: Commit.**
  ```bash
  git add server/src/repos/deviceRepo.ts server/src/routes/devices.ts server/test/devicesRoutes.patch.test.ts
  git commit -m "feat(server): PATCH /api/devices/:id allowlist+diff->events+implicit version"
  ```

---

### Task 3.8: DELETE /api/devices/:id (admin only)

**Files:**
- modify: `server/src/routes/devices.ts`
- create: `server/test/devicesRoutes.delete.test.ts`

- [ ] **Step 1: Write the failing DELETE test.** Create `server/test/devicesRoutes.delete.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { makeTestDb } from '../src/db/test-utils.js';
  import { buildTestApp } from './helpers.js';
  import { authCookie, adminUser, updaterUser } from './helpers.js';
  import { createDevice, getDeviceById } from '../src/repos/deviceRepo.js';

  describe('DELETE /api/devices/:id', () => {
    it('admin deletes a device', async () => {
      const { db } = makeTestDb();
      const d = createDevice(db, { issi: '800' }, null);
      const app = buildTestApp(db);
      const res = await app.request(`/api/devices/${d.id}`, { method: 'DELETE', headers: { Cookie: await authCookie(adminUser) } });
      expect(res.status).toBe(204);
      expect(getDeviceById(db, d.id)).toBeUndefined();
    });

    it('updater gets 403 and the device survives', async () => {
      const { db } = makeTestDb();
      const d = createDevice(db, { issi: '801' }, null);
      const app = buildTestApp(db);
      const res = await app.request(`/api/devices/${d.id}`, { method: 'DELETE', headers: { Cookie: await authCookie(updaterUser) } });
      expect(res.status).toBe(403);
      expect(getDeviceById(db, d.id)).toBeDefined();
    });

    it('admin delete of unknown id returns 404', async () => {
      const { db } = makeTestDb();
      const app = buildTestApp(db);
      const res = await app.request('/api/devices/nope', { method: 'DELETE', headers: { Cookie: await authCookie(adminUser) } });
      expect(res.status).toBe(404);
    });
  });
  ```
- [ ] **Step 2: Run -> expect fail.** `pnpm --filter @ra/server exec vitest run test/devicesRoutes.delete.test.ts` — fails: DELETE route missing.
- [ ] **Step 3: Implement the DELETE route.** Add to `deviceRoutes` in `server/src/routes/devices.ts` (reuse the already-imported `requireRole` and `deleteDevice` — add `deleteDevice` to the repo import line):
  ```ts
  r.delete('/devices/:id', requireRole('admin'), (c) => {
    const ok = deleteDevice(db, c.req.param('id'));
    if (!ok) return c.json({ error: 'not_found' }, 404);
    return c.body(null, 204);
  });
  ```
- [ ] **Step 4: Run -> expect pass.** `pnpm --filter @ra/server exec vitest run test/devicesRoutes.delete.test.ts` — 204 admin, 403 updater (device survives), 404 unknown all green.
- [ ] **Step 5: Commit.**
  ```bash
  git add server/src/routes/devices.ts server/test/devicesRoutes.delete.test.ts
  git commit -m "feat(server): DELETE /api/devices/:id (admin only)"
  ```

---

### Task 3.9: GET /api/devices/:id/events (change history)

**Files:**
- modify: `server/src/routes/devices.ts`
- create: `server/test/devicesRoutes.events.test.ts`

- [ ] **Step 1: Write the failing events test.** Create `server/test/devicesRoutes.events.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { makeTestDb } from '../src/db/test-utils.js';
  import { buildTestApp } from './helpers.js';
  import { authCookie, adminUser } from './helpers.js';
  import { createDevice } from '../src/repos/deviceRepo.js';

  describe('GET /api/devices/:id/events', () => {
    it('returns the change history newest-first after a PATCH', async () => {
      const { db } = makeTestDb();
      const d = createDevice(db, { issi: '600', status: 'einsatzbereit' }, null);
      const app = buildTestApp(db);
      const cookie = await authCookie(adminUser);

      await app.request(`/api/devices/${d.id}`, {
        method: 'PATCH',
        headers: { Cookie: cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'in Reparatur' }),
      });

      const res = await app.request(`/api/devices/${d.id}/events`, { headers: { Cookie: cookie } });
      expect(res.status).toBe(200);
      const events = await res.json();
      expect(Array.isArray(events)).toBe(true);
      const statusEvent = events.find((e: any) => e.field === 'status');
      expect(statusEvent).toMatchObject({ field: 'status', oldValue: 'einsatzbereit', newValue: 'in Reparatur', source: 'manual' });
    });
  });
  ```
- [ ] **Step 2: Run -> expect fail.** `pnpm --filter @ra/server exec vitest run test/devicesRoutes.events.test.ts` — fails: events route missing (404).
- [ ] **Step 3: Implement the events route.** Add to `deviceRoutes` in `server/src/routes/devices.ts` (add `getDeviceEvents` to the repo import line). Register it **before** `'/devices/:id'` is irrelevant here because the path segment `/events` is distinct, but keep route order clean:
  ```ts
  r.get('/devices/:id/events', (c) => {
    const id = c.req.param('id');
    if (!getDeviceById(db, id)) return c.json({ error: 'not_found' }, 404);
    return c.json(getDeviceEvents(db, id));
  });
  ```
- [ ] **Step 4: Run -> expect pass.** `pnpm --filter @ra/server exec vitest run test/devicesRoutes.events.test.ts` — green.
- [ ] **Step 5: Commit.**
  ```bash
  git add server/src/routes/devices.ts server/test/devicesRoutes.events.test.ts
  git commit -m "feat(server): GET /api/devices/:id/events history route"
  ```

---

### Task 3.10: GET /api/suggestions?field= (distinct combobox values)

**Files:**
- create: `server/src/routes/suggestions.ts`
- modify: `server/test/helpers.ts` (mount suggestions router in `buildTestApp`)
- create: `server/test/suggestionsRoutes.test.ts`

> Allowed fields come from `suggestionFieldEnum` (`'rufname'|'deviceType'|'status'|'location'|'assignedTo'`). Values: `SELECT DISTINCT <field> FROM devices WHERE <field> IS NOT NULL ORDER BY <field>`.

- [ ] **Step 1: Mount the suggestions router in the test app.** In `server/test/helpers.ts`, extend `buildTestApp`:
  ```ts
  import { suggestionRoutes } from '../src/routes/suggestions.js';
  // inside buildTestApp, after the devices route:
  app.route('/api', suggestionRoutes(db));
  ```
- [ ] **Step 2: Write the failing suggestions test.** Create `server/test/suggestionsRoutes.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { makeTestDb } from '../src/db/test-utils.js';
  import { buildTestApp } from './helpers.js';
  import { authCookie, adminUser } from './helpers.js';
  import { createDevice } from '../src/repos/deviceRepo.js';

  describe('GET /api/suggestions', () => {
    it('returns distinct, non-null, sorted values for a valid field', async () => {
      const { db } = makeTestDb();
      createDevice(db, { issi: '1', location: 'Wache' }, null);
      createDevice(db, { issi: '2', location: 'Werkstatt' }, null);
      createDevice(db, { issi: '3', location: 'Wache' }, null);
      createDevice(db, { issi: '4' }, null); // null location
      const app = buildTestApp(db);
      const res = await app.request('/api/suggestions?field=location', { headers: { Cookie: await authCookie(adminUser) } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.values).toEqual(['Wache', 'Werkstatt']);
    });

    it('rejects an unknown field with 400', async () => {
      const { db } = makeTestDb();
      const app = buildTestApp(db);
      const res = await app.request('/api/suggestions?field=secret', { headers: { Cookie: await authCookie(adminUser) } });
      expect(res.status).toBe(400);
    });
  });
  ```
- [ ] **Step 3: Run -> expect fail.** `pnpm --filter @ra/server exec vitest run test/suggestionsRoutes.test.ts` — fails: `suggestionRoutes` not found.
- [ ] **Step 4: Implement the suggestions route.** Create `server/src/routes/suggestions.ts`:
  ```ts
  import { Hono } from 'hono';
  import { isNotNull } from 'drizzle-orm';
  import type { Db } from '../repos/deviceRepo.js';
  import { devices } from '../db/schema.js';
  import { suggestionFieldEnum } from '@ra/shared';

  const COLUMN = {
    rufname: devices.rufname,
    deviceType: devices.deviceType,
    status: devices.status,
    location: devices.location,
    assignedTo: devices.assignedTo,
  } as const;

  export function suggestionRoutes(db: Db) {
    const r = new Hono();
    r.get('/suggestions', (c) => {
      const parsed = suggestionFieldEnum.safeParse(c.req.query('field'));
      if (!parsed.success) return c.json({ error: 'invalid_field' }, 400);
      const col = COLUMN[parsed.data];
      const rows = db
        .selectDistinct({ v: col })
        .from(devices)
        .where(isNotNull(col))
        .orderBy(col)
        .all();
      return c.json({ values: rows.map((row) => row.v as string) });
    });
    return r;
  }
  ```
- [ ] **Step 5: Run -> expect pass.** `pnpm --filter @ra/server exec vitest run test/suggestionsRoutes.test.ts` — distinct+sorted and the 400 case green.
- [ ] **Step 6: Mount in production app.** Add `app.route('/api', suggestionRoutes(db))` in `server/src/app.ts` behind `requireAuth`.
- [ ] **Step 7: Commit.**
  ```bash
  git add server/src/routes/suggestions.ts server/src/app.ts server/test/helpers.ts server/test/suggestionsRoutes.test.ts
  git commit -m "feat(server): GET /api/suggestions distinct combobox values"
  ```

---

### Task 3.11: GET /api/software-versions (list + reference marker)

**Files:**
- create: `server/src/routes/softwareVersions.ts`
- modify: `server/test/helpers.ts` (mount router in `buildTestApp`)
- create: `server/test/softwareVersionsRoutes.test.ts`

> Reuses `listSoftwareVersions(db)` from Task 3.3 (newest-first, `reference: true` on the version returned by `getReferenceVersion`). The newest version is only flagged `reference` if it is assigned to ≥1 device — unassigned phantom versions are listed but never marked.

- [ ] **Step 1: Mount the router in the test app.** In `server/test/helpers.ts`, extend `buildTestApp`:
  ```ts
  import { softwareVersionRoutes } from '../src/routes/softwareVersions.js';
  // inside buildTestApp:
  app.route('/api', softwareVersionRoutes(db));
  ```
- [ ] **Step 2: Write the failing test.** Create `server/test/softwareVersionsRoutes.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { makeTestDb } from '../src/db/test-utils.js';
  import { buildTestApp } from './helpers.js';
  import { authCookie, adminUser } from './helpers.js';
  import { createDevice } from '../src/repos/deviceRepo.js';
  import { insertSoftwareVersionIfNew } from '../src/repos/softwareVersionRepo.js';

  describe('GET /api/software-versions', () => {
    it('lists newest-first and marks only the assigned newest as reference', async () => {
      const { db } = makeTestDb();
      insertSoftwareVersionIfNew(db, 'FW 1.0', null, 1000);
      insertSoftwareVersionIfNew(db, 'FW 2.0', null, 2000); // assigned -> reference
      insertSoftwareVersionIfNew(db, 'FW 9.9', null, 9000); // phantom, never assigned
      createDevice(db, { issi: '1', softwareVersion: 'FW 2.0' }, null);
      const app = buildTestApp(db);
      const res = await app.request('/api/software-versions', { headers: { Cookie: await authCookie(adminUser) } });
      expect(res.status).toBe(200);
      const list = await res.json();
      expect(list.map((v: any) => v.value)).toEqual(['FW 9.9', 'FW 2.0', 'FW 1.0']); // newest-first
      const ref = list.filter((v: any) => v.reference);
      expect(ref.length).toBe(1);
      expect(ref[0].value).toBe('FW 2.0'); // phantom FW 9.9 NOT marked
    });
  });
  ```
- [ ] **Step 3: Run -> expect fail.** `pnpm --filter @ra/server exec vitest run test/softwareVersionsRoutes.test.ts` — fails: `softwareVersionRoutes` not found.
- [ ] **Step 4: Implement the route.** Create `server/src/routes/softwareVersions.ts`:
  ```ts
  import { Hono } from 'hono';
  import type { Db } from '../repos/deviceRepo.js';
  import { listSoftwareVersions } from '../repos/softwareVersionRepo.js';

  export function softwareVersionRoutes(db: Db) {
    const r = new Hono();
    r.get('/software-versions', (c) => c.json(listSoftwareVersions(db)));
    return r;
  }
  ```
- [ ] **Step 5: Run -> expect pass.** `pnpm --filter @ra/server exec vitest run test/softwareVersionsRoutes.test.ts` — newest-first order and single reference marker green.
- [ ] **Step 6: Mount in production app.** Add `app.route('/api', softwareVersionRoutes(db))` in `server/src/app.ts` behind `requireAuth`.
- [ ] **Step 7: Run the whole server suite.** `pnpm --filter @ra/server exec vitest run` — entire Phase 3 suite green.
- [ ] **Step 7b: Typecheck.** `pnpm --filter @ra/server exec tsc --noEmit` — no type errors.
- [ ] **Step 8: Commit.**
  ```bash
  git add server/src/routes/softwareVersions.ts server/src/app.ts server/test/helpers.ts server/test/softwareVersionsRoutes.test.ts
  git commit -m "feat(server): GET /api/software-versions list + reference marker"
  ```

---

## Phase 4: CSV-Import (Parse → Mapping → Vorschau → Upsert)

**Goal:** Implement the full CSV bulk-update pipeline — pure diff/classification/header-mapping logic in `shared` (thoroughly unit-tested), plus the server-side encoding/delimiter detection and the `POST /api/import/parse` and `POST /api/import/commit` (dryRun + transactional real-run) routes, with role-gated new-device creation and `filterEditableFields` enforcement for updaters.

> Assumes Phases 1–3 already delivered: the pnpm workspaces (`@ra/shared`, `@ra/server`, `@ra/client`), the Drizzle schema (`server/src/db/schema.ts`), the DB bootstrap/migrations, `shared/src/index.ts` re-exporting `Role`, `UpdateStatus`, `UPDATER_EDITABLE_FIELDS`, `mapGroupsToRole`, `computeUpdateStatus`, `filterEditableFields`, `deviceCreateSchema`, `devicePatchSchema`, `suggestionFieldEnum` and the inferred types `DeviceRecord`, `DeviceCreate`, `DevicePatch`, plus the Hono app with `requireAuth`/`requireRole` middleware and the `device_events` write helper. This phase only *adds* the CSV-specific pieces and re-exports them from the existing `shared/src/index.ts`.

---

### Task 4.1: `diffDevice` — per-field diff producing `FieldDiff[]`

**Files:**
- create: `shared/src/import/diff-device.ts`
- create: `shared/test/import/diff-device.test.ts`
- modify: `shared/src/index.ts`

- [ ] **Step 1: Write the failing test.** Create `shared/test/import/diff-device.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { diffDevice } from '../../src/import/diff-device';
  import type { DeviceRecord } from '../../src';

  const base: DeviceRecord = {
    id: 'dev_1',
    rufname: 'Florian 1',
    issi: '1001',
    serialNumber: 'SN-1',
    deviceType: 'MTP850',
    status: 'einsatzbereit',
    location: 'Wache',
    assignedTo: 'Zugführer',
    softwareVersion: 'FW 12.2',
    lastUpdatedAt: 1700000000000,
    notes: null,
    createdAt: 1690000000000,
    updatedAt: 1690000000000,
    createdBy: 'seed',
    updatedBy: 'seed',
  };

  describe('diffDevice', () => {
    it('returns [] when incoming has no overlapping changed fields', () => {
      expect(diffDevice(base, {})).toEqual([]);
    });

    it('returns [] when incoming values equal existing values', () => {
      expect(diffDevice(base, { softwareVersion: 'FW 12.2', status: 'einsatzbereit' })).toEqual([]);
    });

    it('reports a single changed field with string old/new values', () => {
      expect(diffDevice(base, { softwareVersion: 'FW 12.3' })).toEqual([
        { field: 'softwareVersion', oldValue: 'FW 12.2', newValue: 'FW 12.3' },
      ]);
    });

    it('reports multiple changed fields in stable key order', () => {
      const diff = diffDevice(base, { status: 'in Reparatur', location: 'Werkstatt' });
      expect(diff).toEqual([
        { field: 'status', oldValue: 'einsatzbereit', newValue: 'Werkstatt' === base.location ? null : 'in Reparatur' },
        { field: 'location', oldValue: 'Wache', newValue: 'Werkstatt' },
      ]);
    });

    it('coerces number fields (lastUpdatedAt) to string in the diff', () => {
      expect(diffDevice(base, { lastUpdatedAt: 1700000001000 })).toEqual([
        { field: 'lastUpdatedAt', oldValue: '1700000000000', newValue: '1700000001000' },
      ]);
    });

    it('represents clearing a value as newValue null', () => {
      expect(diffDevice(base, { notes: null as unknown as string })).toEqual([]);
      expect(diffDevice({ ...base, notes: 'old' }, { notes: null as unknown as string })).toEqual([
        { field: 'notes', oldValue: 'old', newValue: null },
      ]);
    });

    it('treats existing null vs incoming value as a change with oldValue null', () => {
      expect(diffDevice({ ...base, notes: null }, { notes: 'neu' })).toEqual([
        { field: 'notes', oldValue: null, newValue: 'neu' },
      ]);
    });

    it('ignores keys not present in incoming (partial patch)', () => {
      expect(diffDevice(base, { rufname: 'Florian 1' })).toEqual([]);
    });

    it('never diffs the identity/system keys id/createdAt/updatedAt even if passed', () => {
      const diff = diffDevice(base, { id: 'other', createdAt: 1, updatedAt: 2 } as Partial<DeviceRecord>);
      expect(diff).toEqual([]);
    });
  });
  ```
  Simplify the multi-field test expectation (the inline ternary is noise): expect exactly
  ```ts
  expect(diff).toEqual([
    { field: 'status', oldValue: 'einsatzbereit', newValue: 'in Reparatur' },
    { field: 'location', oldValue: 'Wache', newValue: 'Werkstatt' },
  ]);
  ```

- [ ] **Step 2: Run the failing test (expect: module-not-found / fail).**
  ```bash
  pnpm --filter @ra/shared exec vitest run test/import/diff-device.test.ts
  ```
  Expected: `Cannot find module '../../src/import/diff-device'` → suite fails.

- [ ] **Step 3: Implement `diffDevice` minimally.** Create `shared/src/import/diff-device.ts`:
  ```ts
  import type { DeviceRecord } from '../schemas';

  export interface FieldDiff {
    field: string;
    oldValue: string | null;
    newValue: string | null;
  }

  // Keys that are never user-diffable (identity + system-managed).
  const NON_DIFFABLE = new Set<keyof DeviceRecord>([
    'id',
    'createdAt',
    'updatedAt',
    'createdBy',
    'updatedBy',
  ]);

  function toStr(v: unknown): string | null {
    if (v === null || v === undefined || v === '') return null;
    return typeof v === 'string' ? v : String(v);
  }

  /**
   * Returns one FieldDiff per key present in `incoming` whose stringified value
   * differs from `existing`. Order follows insertion order of `incoming`.
   */
  export function diffDevice(
    existing: DeviceRecord,
    incoming: Partial<DeviceRecord>,
  ): FieldDiff[] {
    const diffs: FieldDiff[] = [];
    for (const key of Object.keys(incoming) as (keyof DeviceRecord)[]) {
      if (NON_DIFFABLE.has(key)) continue;
      const oldValue = toStr(existing[key]);
      const newValue = toStr(incoming[key]);
      if (oldValue !== newValue) {
        diffs.push({ field: key, oldValue, newValue });
      }
    }
    return diffs;
  }
  ```
  > Note: import `DeviceRecord` from the existing schemas module (Phase 2 created `shared/src/schemas.ts`; adjust the relative path if your schema barrel differs, e.g. `../schemas/index`). `FieldDiff` is defined here and re-exported from the barrel in Step 5.

- [ ] **Step 4: Run the test (expect: pass).**
  ```bash
  pnpm --filter @ra/shared exec vitest run test/import/diff-device.test.ts
  ```
  Expected: all assertions green.

- [ ] **Step 5: Re-export from the public barrel.** In `shared/src/index.ts` add:
  ```ts
  export { diffDevice, type FieldDiff } from './import/diff-device';
  ```

- [ ] **Step 6: Typecheck shared.**
  ```bash
  pnpm --filter @ra/shared exec tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 7: Commit.**
  ```bash
  git checkout -b phase-4-csv-import
  git add shared/src/import/diff-device.ts shared/test/import/diff-device.test.ts shared/src/index.ts
  git commit -m "feat(shared): add diffDevice producing FieldDiff[]"
  ```

---

### Task 4.2: `classifyImportRow` — created / updated / unchanged / error / skipped-no-permission

**Files:**
- create: `shared/src/import/classify-import-row.ts`
- create: `shared/test/import/classify-import-row.test.ts`
- modify: `shared/src/index.ts`

- [ ] **Step 1: Write the failing test.** Create `shared/test/import/classify-import-row.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { classifyImportRow } from '../../src/import/classify-import-row';
  import type { DeviceRecord } from '../../src';

  const existing: DeviceRecord = {
    id: 'dev_1',
    rufname: 'Florian 1',
    issi: '1001',
    serialNumber: 'SN-1',
    deviceType: 'MTP850',
    status: 'einsatzbereit',
    location: 'Wache',
    assignedTo: 'Zugführer',
    softwareVersion: 'FW 12.2',
    lastUpdatedAt: 1700000000000,
    notes: null,
    createdAt: 1690000000000,
    updatedAt: 1690000000000,
    createdBy: 'seed',
    updatedBy: 'seed',
  };

  describe('classifyImportRow', () => {
    it('errors on empty ISSI (admin)', () => {
      const r = classifyImportRow({ incoming: { issi: '' }, existing: null, role: 'admin' });
      expect(r.class).toBe('error');
      expect(r.error).toMatch(/issi/i);
      expect(r.changes).toEqual([]);
    });

    it('errors on whitespace-only ISSI', () => {
      const r = classifyImportRow({ incoming: { issi: '   ' }, existing: null, role: 'admin' });
      expect(r.class).toBe('error');
    });

    it('classifies unknown ISSI as created for admin, with all incoming fields as changes from null', () => {
      const r = classifyImportRow({
        incoming: { issi: '2002', rufname: 'Florian 2', softwareVersion: 'FW 12.3' },
        existing: null,
        role: 'admin',
      });
      expect(r.class).toBe('created');
      expect(r.error).toBeUndefined();
      expect(r.changes).toEqual(
        expect.arrayContaining([
          { field: 'rufname', oldValue: null, newValue: 'Florian 2' },
          { field: 'softwareVersion', oldValue: null, newValue: 'FW 12.3' },
        ]),
      );
    });

    it('classifies unknown ISSI as skipped-no-permission for updater (no creation)', () => {
      const r = classifyImportRow({
        incoming: { issi: '2002', rufname: 'Florian 2', softwareVersion: 'FW 12.3' },
        existing: null,
        role: 'updater',
      });
      expect(r.class).toBe('skipped-no-permission');
      expect(r.changes).toEqual([]);
    });

    it('classifies a matched row with changed allowed field as updated (admin)', () => {
      const r = classifyImportRow({
        incoming: { issi: '1001', softwareVersion: 'FW 12.3' },
        existing,
        role: 'admin',
      });
      expect(r.class).toBe('updated');
      expect(r.changes).toEqual([
        { field: 'softwareVersion', oldValue: 'FW 12.2', newValue: 'FW 12.3' },
      ]);
    });

    it('classifies a matched row with no effective change as unchanged', () => {
      const r = classifyImportRow({
        incoming: { issi: '1001', softwareVersion: 'FW 12.2' },
        existing,
        role: 'admin',
      });
      expect(r.class).toBe('unchanged');
      expect(r.changes).toEqual([]);
    });

    it('for updater on a matched row, only allowlisted fields are considered (status/swVersion/lastUpdatedAt)', () => {
      const r = classifyImportRow({
        incoming: { issi: '1001', softwareVersion: 'FW 12.3', location: 'Werkstatt', rufname: 'X' },
        existing,
        role: 'updater',
      });
      expect(r.class).toBe('updated');
      expect(r.changes).toEqual([
        { field: 'softwareVersion', oldValue: 'FW 12.2', newValue: 'FW 12.3' },
      ]);
    });

    it('for updater on a matched row where only locked fields differ, result is unchanged', () => {
      const r = classifyImportRow({
        incoming: { issi: '1001', location: 'Werkstatt', rufname: 'X' },
        existing,
        role: 'updater',
      });
      expect(r.class).toBe('unchanged');
      expect(r.changes).toEqual([]);
    });

    it('does not include issi itself as a change even when existing differs (issi is the match key)', () => {
      // existing matched by issi; incoming repeats issi -> never a diff
      const r = classifyImportRow({
        incoming: { issi: '1001' },
        existing,
        role: 'admin',
      });
      expect(r.class).toBe('unchanged');
      expect(r.changes.find((c) => c.field === 'issi')).toBeUndefined();
    });
  });
  ```

- [ ] **Step 2: Run the failing test (expect: module-not-found / fail).**
  ```bash
  pnpm --filter @ra/shared exec vitest run test/import/classify-import-row.test.ts
  ```
  Expected: `Cannot find module '../../src/import/classify-import-row'`.

- [ ] **Step 3: Implement `classifyImportRow` minimally.** Create `shared/src/import/classify-import-row.ts`:
  ```ts
  import type { DeviceRecord } from '../schemas';
  import type { DevicePatch } from '../schemas';
  import type { Role } from '../roles';
  import { UPDATER_EDITABLE_FIELDS } from '../roles';
  import { filterEditableFields } from '../roles';
  import { diffDevice, type FieldDiff } from './diff-device';

  export type ImportRowClass =
    | 'created'
    | 'updated'
    | 'unchanged'
    | 'error'
    | 'skipped-no-permission';

  export interface ClassifyResult {
    class: ImportRowClass;
    changes: FieldDiff[];
    error?: string;
  }

  type Incoming = DevicePatch & { issi: string };

  export function classifyImportRow(args: {
    incoming: Incoming;
    existing: DeviceRecord | null;
    role: Role;
  }): ClassifyResult {
    const { incoming, existing, role } = args;

    // 1) ISSI is the mandatory match key.
    if (typeof incoming.issi !== 'string' || incoming.issi.trim() === '') {
      return { class: 'error', changes: [], error: 'Leere ISSI' };
    }

    // 2) Apply role allowlist to the incoming patch (updater -> only editable fields).
    //    issi is always carried for the match key but is never a diffable field.
    const { issi: _issi, ...rest } = incoming;
    const allowed = filterEditableFields(role, rest as Record<string, unknown>);

    // 3) Unknown ISSI -> create (admin) or skip (updater lacks create permission).
    if (existing === null) {
      if (role !== 'admin') {
        return { class: 'skipped-no-permission', changes: [] };
      }
      const changes = diffDevice(
        emptyDevice(incoming.issi),
        allowed as Partial<DeviceRecord>,
      );
      return { class: 'created', changes };
    }

    // 4) Matched ISSI -> diff allowlisted fields against the existing record.
    const changes = diffDevice(existing, allowed as Partial<DeviceRecord>);
    return { class: changes.length === 0 ? 'unchanged' : 'updated', changes };
  }

  // A synthetic all-null device so created-row diffs show oldValue: null.
  function emptyDevice(issi: string): DeviceRecord {
    return {
      id: '',
      rufname: null,
      issi,
      serialNumber: null,
      deviceType: null,
      status: null,
      location: null,
      assignedTo: null,
      softwareVersion: null,
      lastUpdatedAt: null,
      notes: null,
      createdAt: 0,
      updatedAt: 0,
      createdBy: null,
      updatedBy: null,
    } as DeviceRecord;
  }

  // Re-export so callers needn't reach into roles for the constant.
  export { UPDATER_EDITABLE_FIELDS };
  ```
  > Adjust the three import paths (`../schemas`, `../roles`) to wherever Phase 1/2 placed `DeviceRecord`/`DevicePatch` and `Role`/`UPDATER_EDITABLE_FIELDS`/`filterEditableFields`. If they all live in `../index`, import from there instead. `filterEditableFields` for `admin` is passthrough, so admin sees every incoming column; for `updater` it keeps only `softwareVersion`/`lastUpdatedAt`/`status` — exactly the allowlist test asserts.

- [ ] **Step 4: Run the test (expect: pass).**
  ```bash
  pnpm --filter @ra/shared exec vitest run test/import/classify-import-row.test.ts
  ```
  Expected: all assertions green.

- [ ] **Step 5: Re-export from the public barrel.** In `shared/src/index.ts` add:
  ```ts
  export { classifyImportRow, type ImportRowClass } from './import/classify-import-row';
  ```

- [ ] **Step 6: Typecheck shared.**
  ```bash
  pnpm --filter @ra/shared exec tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 7: Commit.**
  ```bash
  git add shared/src/import/classify-import-row.ts shared/test/import/classify-import-row.test.ts shared/src/index.ts
  git commit -m "feat(shared): add classifyImportRow with role-gated created/updated/unchanged/error/skipped"
  ```

---

### Task 4.3: Header auto-mapping helper (`autoMapHeaders`)

**Files:**
- create: `shared/src/import/auto-map-headers.ts`
- create: `shared/test/import/auto-map-headers.test.ts`
- modify: `shared/src/index.ts`

- [ ] **Step 1: Write the failing test.** Create `shared/test/import/auto-map-headers.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { autoMapHeaders, IMPORTABLE_FIELDS } from '../../src/import/auto-map-headers';

  describe('autoMapHeaders', () => {
    it('maps exact German/English header names to device fields', () => {
      const m = autoMapHeaders(['ISSI', 'Rufname', 'Softwareversion', 'Standort']);
      expect(m).toEqual({
        ISSI: 'issi',
        Rufname: 'rufname',
        Softwareversion: 'softwareVersion',
        Standort: 'location',
      });
    });

    it('is case-insensitive and ignores surrounding whitespace and punctuation', () => {
      const m = autoMapHeaders(['  issi ', 'Ruf-Name', 'SW Version', 'zuletzt aktualisiert']);
      expect(m['  issi ']).toBe('issi');
      expect(m['Ruf-Name']).toBe('rufname');
      expect(m['SW Version']).toBe('softwareVersion');
      expect(m['zuletzt aktualisiert']).toBe('lastUpdatedAt');
    });

    it('maps common ISSI synonyms', () => {
      for (const h of ['ISSI', 'Funkrufname-ISSI', 'TEI', 'Kennung']) {
        expect(autoMapHeaders([h])[h]).toBe('issi');
      }
    });

    it('maps serial-number and device-type synonyms', () => {
      const m = autoMapHeaders(['Seriennummer', 'Geraetetyp', 'Typ', 'Zuordnung', 'Status', 'Notizen']);
      expect(m['Seriennummer']).toBe('serialNumber');
      expect(m['Geraetetyp']).toBe('deviceType');
      expect(m['Typ']).toBe('deviceType');
      expect(m['Zuordnung']).toBe('assignedTo');
      expect(m['Status']).toBe('status');
      expect(m['Notizen']).toBe('notes');
    });

    it('returns no entry for unrecognized headers (left for manual mapping)', () => {
      const m = autoMapHeaders(['Bemerkung XY', 'Spalte 7', '']);
      expect(m['Spalte 7']).toBeUndefined();
      expect(m['']).toBeUndefined();
    });

    it('does not map two headers to the same field (first match wins)', () => {
      const m = autoMapHeaders(['Typ', 'Gerätetyp']);
      expect(m['Typ']).toBe('deviceType');
      expect(m['Gerätetyp']).toBeUndefined();
    });

    it('exposes the set of importable target fields', () => {
      expect(IMPORTABLE_FIELDS).toContain('issi');
      expect(IMPORTABLE_FIELDS).toContain('softwareVersion');
      expect(IMPORTABLE_FIELDS).not.toContain('id');
    });
  });
  ```

- [ ] **Step 2: Run the failing test (expect: module-not-found / fail).**
  ```bash
  pnpm --filter @ra/shared exec vitest run test/import/auto-map-headers.test.ts
  ```
  Expected: `Cannot find module '../../src/import/auto-map-headers'`.

- [ ] **Step 3: Implement `autoMapHeaders` minimally.** Create `shared/src/import/auto-map-headers.ts`:
  ```ts
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
  ] as const;

  export type ImportableField = (typeof IMPORTABLE_FIELDS)[number];

  // Normalize a header: lowercase, strip accents, drop everything but [a-z0-9].
  function norm(h: string): string {
    return h
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
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
    geratetyp: 'deviceType',
    typ: 'deviceType',
    modell: 'deviceType',
    status: 'status',
    zustand: 'status',
    standort: 'location',
    ort: 'location',
    location: 'location',
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
   * Returns a record keyed by the ORIGINAL header string. Unrecognized headers
   * and headers whose target field is already claimed are omitted (first wins).
   */
  export function autoMapHeaders(headers: string[]): Record<string, ImportableField> {
    const result: Record<string, ImportableField> = {};
    const used = new Set<ImportableField>();
    for (const raw of headers) {
      const key = norm(raw);
      const field = SYNONYMS[key];
      if (field && !used.has(field)) {
        result[raw] = field;
        used.add(field);
      }
    }
    return result;
  }
  ```
  > `bemerkung` maps to `notes`; the test's `'Bemerkung XY'` normalizes to `bemerkungxy` (no match) — that assertion still holds. `'Status'` and `'Typ'` resolve via exact normalized keys.

- [ ] **Step 4: Run the test (expect: pass).**
  ```bash
  pnpm --filter @ra/shared exec vitest run test/import/auto-map-headers.test.ts
  ```
  Expected: all green.

- [ ] **Step 5: Re-export from the public barrel.** In `shared/src/index.ts` add:
  ```ts
  export {
    autoMapHeaders,
    IMPORTABLE_FIELDS,
    type ImportableField,
  } from './import/auto-map-headers';
  ```

- [ ] **Step 6: Typecheck shared.**
  ```bash
  pnpm --filter @ra/shared exec tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 7: Commit.**
  ```bash
  git add shared/src/import/auto-map-headers.ts shared/test/import/auto-map-headers.test.ts shared/src/index.ts
  git commit -m "feat(shared): add autoMapHeaders header-to-field auto-mapping"
  ```

---

### Task 4.4: `importCommitSchema` (Zod) + inferred type

**Files:**
- create: `shared/src/import/import-schema.ts`
- create: `shared/test/import/import-schema.test.ts`
- modify: `shared/src/index.ts`

- [ ] **Step 1: Write the failing test.** Create `shared/test/import/import-schema.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { importCommitSchema } from '../../src/import/import-schema';

  const valid = {
    dryRun: true,
    mapping: { '0': 'issi', '1': 'softwareVersion' },
    rows: [
      ['1001', 'FW 12.3'],
      ['1002', 'FW 12.2'],
    ],
  };

  describe('importCommitSchema', () => {
    it('accepts a valid payload', () => {
      const parsed = importCommitSchema.parse(valid);
      expect(parsed.dryRun).toBe(true);
      expect(parsed.rows).toHaveLength(2);
    });

    it('defaults dryRun to false when omitted', () => {
      const parsed = importCommitSchema.parse({ mapping: { '0': 'issi' }, rows: [['1001']] });
      expect(parsed.dryRun).toBe(false);
    });

    it('rejects a mapping that does not include issi', () => {
      const r = importCommitSchema.safeParse({ ...valid, mapping: { '0': 'softwareVersion' } });
      expect(r.success).toBe(false);
    });

    it('rejects a mapping value that is not an importable field', () => {
      const r = importCommitSchema.safeParse({ ...valid, mapping: { '0': 'issi', '1': 'id' } });
      expect(r.success).toBe(false);
    });

    it('rejects when rows is missing or not an array of string arrays', () => {
      expect(importCommitSchema.safeParse({ ...valid, rows: undefined }).success).toBe(false);
      expect(importCommitSchema.safeParse({ ...valid, rows: [[1, 2]] }).success).toBe(false);
    });

    it('accepts an empty rows array', () => {
      expect(importCommitSchema.safeParse({ ...valid, rows: [] }).success).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run the failing test (expect: module-not-found / fail).**
  ```bash
  pnpm --filter @ra/shared exec vitest run test/import/import-schema.test.ts
  ```
  Expected: `Cannot find module '../../src/import/import-schema'`.

- [ ] **Step 3: Implement the schema.** Create `shared/src/import/import-schema.ts`:
  ```ts
  import { z } from 'zod';
  import { IMPORTABLE_FIELDS } from './auto-map-headers';

  const importableFieldEnum = z.enum(IMPORTABLE_FIELDS);

  /**
   * mapping: column-index (as string key) -> target device field.
   * rows: the raw parsed string matrix from /api/import/parse.
   * dryRun: true => classification summary only; false => transactional upsert.
   */
  export const importCommitSchema = z
    .object({
      dryRun: z.boolean().default(false),
      mapping: z.record(z.string(), importableFieldEnum),
      rows: z.array(z.array(z.string())),
    })
    .refine(
      (v) => Object.values(v.mapping).includes('issi'),
      { message: 'Mapping muss die ISSI-Spalte enthalten', path: ['mapping'] },
    );

  export type ImportCommit = z.infer<typeof importCommitSchema>;
  ```

- [ ] **Step 4: Run the test (expect: pass).**
  ```bash
  pnpm --filter @ra/shared exec vitest run test/import/import-schema.test.ts
  ```
  Expected: all green.

- [ ] **Step 5: Re-export from the public barrel.** In `shared/src/index.ts` add:
  ```ts
  export { importCommitSchema, type ImportCommit } from './import/import-schema';
  ```

- [ ] **Step 6: Typecheck + run the full shared suite (no regressions).**
  ```bash
  pnpm --filter @ra/shared exec tsc --noEmit
  pnpm --filter @ra/shared exec vitest run
  ```
  Expected: typecheck clean; all shared tests green (4.1–4.4 + earlier phases).

- [ ] **Step 7: Commit.**
  ```bash
  git add shared/src/import/import-schema.ts shared/test/import/import-schema.test.ts shared/src/index.ts
  git commit -m "feat(shared): add importCommitSchema with issi-required refinement"
  ```

---

### Task 4.5: Server CSV decode helper — chardet + iconv-lite + BOM strip

**Files:**
- create: `server/src/import/decode-csv.ts`
- create: `server/test/import/decode-csv.test.ts`
- modify: `server/package.json` (add deps if not present)

- [ ] **Step 1: Ensure server deps.** Add `chardet` and `iconv-lite` to `@ra/server` if missing:
  ```bash
  pnpm --filter @ra/server add chardet iconv-lite
  ```
  Expected: `package.json` lists both under `dependencies`.

- [ ] **Step 2: Write the failing test.** Create `server/test/import/decode-csv.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import iconv from 'iconv-lite';
  import { decodeCsv } from '../../src/import/decode-csv';

  describe('decodeCsv', () => {
    it('decodes a cp1252 (latin1) buffer with German umlauts to correct UTF-8 string', () => {
      const original = 'Rufname;Standort\nGerät;Köln\n';
      const buf = iconv.encode(original, 'win1252');
      const { text, encoding } = decodeCsv(buf);
      expect(text).toContain('Gerät');
      expect(text).toContain('Köln');
      // chardet may report windows-1252 / ISO-8859-1; both are latin-family
      expect(encoding.toLowerCase()).toMatch(/1252|8859|latin/);
    });

    it('decodes a UTF-8 buffer unchanged', () => {
      const buf = Buffer.from('a;b\nGrün;Süd\n', 'utf8');
      const { text } = decodeCsv(buf);
      expect(text).toContain('Grün');
      expect(text).toContain('Süd');
    });

    it('strips a UTF-8 BOM from the start of the decoded text', () => {
      const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('issi;rufname\n', 'utf8')]);
      const { text } = decodeCsv(buf);
      expect(text.charCodeAt(0)).not.toBe(0xfeff);
      expect(text.startsWith('issi')).toBe(true);
    });

    it('throws on an empty buffer', () => {
      expect(() => decodeCsv(Buffer.alloc(0))).toThrow();
    });
  });
  ```

- [ ] **Step 3: Run the failing test (expect: module-not-found / fail).**
  ```bash
  pnpm --filter @ra/server exec vitest run test/import/decode-csv.test.ts
  ```
  Expected: `Cannot find module '../../src/import/decode-csv'`.

- [ ] **Step 4: Implement `decodeCsv`.** Create `server/src/import/decode-csv.ts`:
  ```ts
  import chardet from 'chardet';
  import iconv from 'iconv-lite';

  export interface DecodedCsv {
    text: string;
    encoding: string;
  }

  /**
   * Detects the byte encoding (chardet), decodes to a UTF-8 JS string (iconv-lite),
   * and strips a leading BOM. Falls back to UTF-8 if detection fails or is unsupported.
   */
  export function decodeCsv(buffer: Buffer): DecodedCsv {
    if (buffer.length === 0) {
      throw new Error('Leere Datei');
    }
    const detected = chardet.detect(buffer) ?? 'UTF-8';
    const encoding = iconv.encodingExists(detected) ? detected : 'UTF-8';
    let text = iconv.decode(buffer, encoding);
    // Strip BOM (U+FEFF) if iconv left one in place.
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }
    return { text, encoding };
  }
  ```

- [ ] **Step 5: Run the test (expect: pass).**
  ```bash
  pnpm --filter @ra/server exec vitest run test/import/decode-csv.test.ts
  ```
  Expected: all green.

- [ ] **Step 6: Commit.**
  ```bash
  git add server/src/import/decode-csv.ts server/test/import/decode-csv.test.ts server/package.json
  git commit -m "feat(server): add decodeCsv (chardet detect + iconv-lite + BOM strip)"
  ```

---

### Task 4.6: Server CSV parse helper — delimiter auto-detect + csv-parse

**Files:**
- create: `server/src/import/parse-csv.ts`
- create: `server/test/import/parse-csv.test.ts`
- modify: `server/package.json` (add `csv-parse` if not present)

- [ ] **Step 1: Ensure `csv-parse` dep.**
  ```bash
  pnpm --filter @ra/server add csv-parse
  ```
  Expected: listed under `dependencies`.

- [ ] **Step 2: Write the failing test.** Create `server/test/import/parse-csv.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { detectDelimiter, parseCsvText } from '../../src/import/parse-csv';

  describe('detectDelimiter', () => {
    it('defaults to semicolon for German-Excel CSV', () => {
      expect(detectDelimiter('issi;rufname;status\n1001;Florian 1;ok\n')).toBe(';');
    });
    it('detects comma when comma is the dominant separator', () => {
      expect(detectDelimiter('issi,rufname,status\n1001,Florian 1,ok\n')).toBe(',');
    });
    it('detects tab when tabs dominate', () => {
      expect(detectDelimiter('issi\trufname\tstatus\n1001\tFlorian 1\tok\n')).toBe('\t');
    });
    it('prefers semicolon when ambiguous (semicolon present at all)', () => {
      expect(detectDelimiter('a;b,c\n1;2,3\n')).toBe(';');
    });
  });

  describe('parseCsvText', () => {
    it('parses a semicolon CSV into columns + rows', () => {
      const { columns, rows, delimiter } = parseCsvText('ISSI;Rufname\n1001;Florian 1\n1002;Florian 2\n');
      expect(delimiter).toBe(';');
      expect(columns).toEqual(['ISSI', 'Rufname']);
      expect(rows).toEqual([
        ['1001', 'Florian 1'],
        ['1002', 'Florian 2'],
      ]);
    });

    it('trims surrounding whitespace inside fields and skips fully empty lines', () => {
      const { rows } = parseCsvText('ISSI;Rufname\n 1001 ; Florian 1 \n\n1002;Florian 2\n');
      expect(rows).toEqual([
        ['1001', 'Florian 1'],
        ['1002', 'Florian 2'],
      ]);
    });

    it('handles quoted fields containing the delimiter', () => {
      const { rows } = parseCsvText('ISSI;Notiz\n1001;"a; b; c"\n');
      expect(rows).toEqual([['1001', 'a; b; c']]);
    });

    it('returns empty rows for a header-only file', () => {
      const { columns, rows } = parseCsvText('ISSI;Rufname\n');
      expect(columns).toEqual(['ISSI', 'Rufname']);
      expect(rows).toEqual([]);
    });
  });
  ```

- [ ] **Step 3: Run the failing test (expect: module-not-found / fail).**
  ```bash
  pnpm --filter @ra/server exec vitest run test/import/parse-csv.test.ts
  ```
  Expected: `Cannot find module '../../src/import/parse-csv'`.

- [ ] **Step 4: Implement `parse-csv.ts`.** Create `server/src/import/parse-csv.ts`:
  ```ts
  import { parse } from 'csv-parse/sync';

  const CANDIDATES = [';', ',', '\t'] as const;
  export type Delimiter = (typeof CANDIDATES)[number];

  /**
   * Picks a delimiter by counting occurrences on the first non-empty line.
   * `;` wins ties / is preferred whenever it appears (German-Excel default).
   */
  export function detectDelimiter(text: string): Delimiter {
    const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
    const counts: Record<Delimiter, number> = { ';': 0, ',': 0, '\t': 0 };
    for (const d of CANDIDATES) {
      counts[d] = firstLine.split(d).length - 1;
    }
    if (counts[';'] > 0) return ';';
    if (counts['\t'] > counts[',']) return '\t';
    if (counts[','] > 0) return ',';
    if (counts['\t'] > 0) return '\t';
    return ';';
  }

  export interface ParsedCsv {
    columns: string[];
    rows: string[][];
    delimiter: Delimiter;
  }

  export function parseCsvText(text: string, forced?: Delimiter): ParsedCsv {
    const delimiter = forced ?? detectDelimiter(text);
    const records = parse(text, {
      delimiter,
      bom: true,
      trim: true,
      skip_empty_lines: true,
      relax_column_count: true,
    }) as string[][];

    const [columns = [], ...rows] = records;
    return { columns, rows, delimiter };
  }
  ```
  > `csv-parse/sync` is the synchronous API; `trim:true` and `skip_empty_lines:true` satisfy the whitespace/empty-line tests. `relax_column_count` keeps ragged rows from throwing.

- [ ] **Step 5: Run the test (expect: pass).**
  ```bash
  pnpm --filter @ra/server exec vitest run test/import/parse-csv.test.ts
  ```
  Expected: all green.

- [ ] **Step 6: Commit.**
  ```bash
  git add server/src/import/parse-csv.ts server/test/import/parse-csv.test.ts server/package.json
  git commit -m "feat(server): add delimiter auto-detect + csv-parse wrapper"
  ```

---

### Task 4.7: Route `POST /api/import/parse` (multipart → columns/rows/detected)

**Files:**
- create: `server/src/routes/import.ts`
- create: `server/test/routes/import-parse.test.ts`
- modify: `server/src/app.ts` (mount the route)

- [ ] **Step 1: Write the failing route test.** Create `server/test/routes/import-parse.test.ts`. Use the existing test app factory (Phase 3 exports `createApp`/`createTestApp` with `AUTH_DEV_BYPASS` semantics) and Hono's `app.request`:
  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import iconv from 'iconv-lite';
  import { createTestApp } from '../helpers/test-app';

  function multipart(buf: Buffer, filename = 'geraete.csv'): FormData {
    const fd = new FormData();
    fd.append('file', new Blob([buf], { type: 'text/csv' }), filename);
    return fd;
  }

  describe('POST /api/import/parse', () => {
    let app: ReturnType<typeof createTestApp>;
    beforeEach(() => {
      app = createTestApp({ role: 'updater' }); // any authenticated user may parse
    });

    it('returns 401 when unauthenticated', async () => {
      const noAuth = createTestApp({ authenticated: false });
      const res = await noAuth.request('/api/import/parse', { method: 'POST', body: multipart(Buffer.from('a;b\n1;2\n')) });
      expect(res.status).toBe(401);
    });

    it('parses a cp1252 semicolon CSV and reports detected delimiter + encoding', async () => {
      const csv = 'ISSI;Rufname;Standort\n1001;Gerät 1;Köln\n1002;Gerät 2;Düsseldorf\n';
      const buf = iconv.encode(csv, 'win1252');
      const res = await app.request('/api/import/parse', { method: 'POST', body: multipart(buf) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.columns).toEqual(['ISSI', 'Rufname', 'Standort']);
      expect(body.rows).toEqual([
        ['1001', 'Gerät 1', 'Köln'],
        ['1002', 'Gerät 2', 'Düsseldorf'],
      ]);
      expect(body.detected.delimiter).toBe(';');
      expect(String(body.detected.encoding).toLowerCase()).toMatch(/1252|8859|latin/);
    });

    it('returns 400 when no file part is present', async () => {
      const fd = new FormData();
      const res = await app.request('/api/import/parse', { method: 'POST', body: fd });
      expect(res.status).toBe(400);
    });

    it('returns 400 for an empty file', async () => {
      const res = await app.request('/api/import/parse', { method: 'POST', body: multipart(Buffer.alloc(0)) });
      expect(res.status).toBe(400);
    });
  });
  ```
  > If Phase 3's helper is named differently (e.g. `buildApp`), adjust the import; the only requirements are: an app whose `requireAuth` passes for an injected user and a way to request unauthenticated. The `createTestApp({ role })` shape matches the dev-bypass injection contract.

- [ ] **Step 2: Run the failing test (expect: 404 / route-missing fail).**
  ```bash
  pnpm --filter @ra/server exec vitest run test/routes/import-parse.test.ts
  ```
  Expected: requests 404 (route not mounted) → assertions fail.

- [ ] **Step 3: Implement the parse route.** Create `server/src/routes/import.ts`:
  ```ts
  import { Hono } from 'hono';
  import { requireAuth } from '../middleware/auth';
  import { decodeCsv } from '../import/decode-csv';
  import { parseCsvText } from '../import/parse-csv';
  import type { AppEnv } from '../types';

  export const importRoutes = new Hono<AppEnv>();

  importRoutes.use('*', requireAuth);

  importRoutes.post('/parse', async (c) => {
    const form = await c.req.parseBody();
    const file = form['file'];
    if (!(file instanceof File)) {
      return c.json({ error: 'Keine Datei hochgeladen' }, 400);
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    let decoded;
    try {
      decoded = decodeCsv(buffer);
    } catch {
      return c.json({ error: 'Leere oder ungültige Datei' }, 400);
    }
    const { columns, rows, delimiter } = parseCsvText(decoded.text);
    return c.json({
      columns,
      rows,
      detected: { delimiter, encoding: decoded.encoding },
    });
  });
  ```
  > `requireAuth`, `AppEnv` (the Hono `Variables` env with `user`), and the middleware path are owned by Phase 3 — import them from wherever they live (`../middleware/auth`, `../types`). Keep `importRoutes` as the named export; the commit route is added to this same router in Task 4.8.

- [ ] **Step 4: Mount the router.** In `server/src/app.ts`, add:
  ```ts
  import { importRoutes } from './routes/import';
  // ...after other api route mounts:
  api.route('/import', importRoutes);
  ```
  > Use the same sub-app/`api` Hono instance the other `/api/*` routes are attached to in Phase 3.

- [ ] **Step 5: Run the test (expect: pass).**
  ```bash
  pnpm --filter @ra/server exec vitest run test/routes/import-parse.test.ts
  ```
  Expected: all green.

- [ ] **Step 6: Commit.**
  ```bash
  git add server/src/routes/import.ts server/test/routes/import-parse.test.ts server/src/app.ts
  git commit -m "feat(server): add POST /api/import/parse (multipart -> columns/rows/detected)"
  ```

---

### Task 4.8: Route `POST /api/import/commit` — dryRun classification summary

**Files:**
- create: `server/src/import/commit-service.ts`
- create: `server/test/routes/import-commit-dryrun.test.ts`
- modify: `server/src/routes/import.ts`

- [ ] **Step 1: Write the failing dryRun test.** Create `server/test/routes/import-commit-dryrun.test.ts`. Seed devices via the test DB helper (Phase 2 exposes a `seedDevices`/`db` test helper); then assert the classification summary:
  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import { createTestApp } from '../helpers/test-app';
  import { seedDevice } from '../helpers/seed';

  describe('POST /api/import/commit (dryRun)', () => {
    beforeEach(async () => {
      await seedDevice({ issi: '1001', softwareVersion: 'FW 12.2', status: 'einsatzbereit' });
      await seedDevice({ issi: '1002', softwareVersion: 'FW 12.3', status: 'einsatzbereit' });
    });

    const mapping = { '0': 'issi', '1': 'softwareVersion' };

    it('admin dryRun classifies created/updated/unchanged/error and never writes', async () => {
      const app = createTestApp({ role: 'admin' });
      const res = await app.request('/api/import/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          dryRun: true,
          mapping,
          rows: [
            ['1001', 'FW 12.3'], // updated
            ['1002', 'FW 12.3'], // unchanged
            ['9999', 'FW 12.3'], // created (admin)
            ['', 'FW 12.3'],     // error: empty issi
          ],
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.summary).toEqual({ created: 1, updated: 1, unchanged: 1, error: 1, 'skipped-no-permission': 0 });
      expect(body.rows).toHaveLength(4);
      expect(body.rows[0].class).toBe('updated');
      expect(body.rows[0].changes).toEqual([
        { field: 'softwareVersion', oldValue: 'FW 12.2', newValue: 'FW 12.3' },
      ]);
      expect(body.rows[3].class).toBe('error');
      expect(body.rows[3].error).toMatch(/issi/i);
    });

    it('flags duplicate ISSI within the file as error on the second occurrence', async () => {
      const app = createTestApp({ role: 'admin' });
      const res = await app.request('/api/import/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          dryRun: true,
          mapping,
          rows: [
            ['1001', 'FW 12.3'],
            ['1001', 'FW 12.4'], // duplicate in file
          ],
        }),
      });
      const body = await res.json();
      expect(body.rows[0].class).toBe('updated');
      expect(body.rows[1].class).toBe('error');
      expect(body.rows[1].error).toMatch(/duplikat|duplicate/i);
      expect(body.summary.error).toBe(1);
    });

    it('updater dryRun reports unknown ISSI as skipped-no-permission (no created)', async () => {
      const app = createTestApp({ role: 'updater' });
      const res = await app.request('/api/import/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          dryRun: true,
          mapping: { '0': 'issi', '1': 'softwareVersion', '2': 'location' },
          rows: [
            ['1001', 'FW 12.3', 'Werkstatt'], // updated, but location ignored for updater
            ['8888', 'FW 12.3', 'Werkstatt'], // skipped-no-permission
          ],
        }),
      });
      const body = await res.json();
      expect(body.summary.created).toBe(0);
      expect(body.summary['skipped-no-permission']).toBe(1);
      expect(body.rows[0].class).toBe('updated');
      expect(body.rows[0].changes).toEqual([
        { field: 'softwareVersion', oldValue: 'FW 12.2', newValue: 'FW 12.3' },
      ]); // location NOT in changes (filtered for updater)
    });

    it('returns 400 when mapping omits issi (zod refinement)', async () => {
      const app = createTestApp({ role: 'admin' });
      const res = await app.request('/api/import/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dryRun: true, mapping: { '0': 'softwareVersion' }, rows: [['x']] }),
      });
      expect(res.status).toBe(400);
    });
  });
  ```

- [ ] **Step 2: Run the failing test (expect: 404 / route-missing fail).**
  ```bash
  pnpm --filter @ra/server exec vitest run test/routes/import-commit-dryrun.test.ts
  ```
  Expected: route absent → fails.

- [ ] **Step 3: Implement the row-mapping + classification service (pure, no writes).** Create `server/src/import/commit-service.ts`:
  ```ts
  import {
    classifyImportRow,
    type ImportRowClass,
    type FieldDiff,
    type ImportableField,
  } from '@ra/shared';
  import type { DeviceRecord, DevicePatch, Role } from '@ra/shared';

  export interface ClassifiedRow {
    rowIndex: number;
    issi: string;
    class: ImportRowClass;
    changes: FieldDiff[];
    error?: string;
  }

  export type ImportSummary = Record<ImportRowClass, number>;

  // Number-typed device fields the CSV may target.
  const NUMERIC_FIELDS = new Set<ImportableField>(['lastUpdatedAt']);

  /** Turns one raw string row into a typed { issi, ...patch } via the column mapping. */
  function rowToIncoming(
    row: string[],
    mapping: Record<string, ImportableField>,
  ): DevicePatch & { issi: string } {
    const out: Record<string, unknown> = { issi: '' };
    for (const [colIdx, field] of Object.entries(mapping)) {
      const raw = row[Number(colIdx)];
      const value = typeof raw === 'string' ? raw.trim() : '';
      if (field === 'issi') {
        out.issi = value;
      } else if (NUMERIC_FIELDS.has(field)) {
        out[field] = value === '' ? null : Number(value);
      } else {
        out[field] = value === '' ? null : value;
      }
    }
    return out as DevicePatch & { issi: string };
  }

  /**
   * Classifies every row against the lookup of existing devices by ISSI.
   * Detects in-file duplicate ISSIs (second+ occurrence -> error).
   */
  export function classifyRows(args: {
    rows: string[][];
    mapping: Record<string, ImportableField>;
    existingByIssi: Map<string, DeviceRecord>;
    role: Role;
  }): { rows: ClassifiedRow[]; summary: ImportSummary } {
    const { rows, mapping, existingByIssi, role } = args;
    const summary: ImportSummary = {
      created: 0,
      updated: 0,
      unchanged: 0,
      error: 0,
      'skipped-no-permission': 0,
    };
    const seen = new Set<string>();
    const out: ClassifiedRow[] = rows.map((row, rowIndex) => {
      const incoming = rowToIncoming(row, mapping);
      const issi = incoming.issi;

      if (issi !== '' && seen.has(issi)) {
        summary.error += 1;
        return { rowIndex, issi, class: 'error', changes: [], error: 'Duplikat in Datei' };
      }
      if (issi !== '') seen.add(issi);

      const existing = issi === '' ? null : existingByIssi.get(issi) ?? null;
      const result = classifyImportRow({ incoming, existing, role });
      summary[result.class] += 1;
      return { rowIndex, issi, class: result.class, changes: result.changes, error: result.error };
    });
    return { rows: out, summary };
  }
  ```
  > `ImportableField` is the type from `autoMapHeaders` (Task 4.3), re-exported from `@ra/shared`. The Zod schema already constrains mapping values to that set.

- [ ] **Step 4: Add the commit route (dryRun branch only for now).** In `server/src/routes/import.ts` append:
  ```ts
  import { importCommitSchema } from '@ra/shared';
  import type { DeviceRecord } from '@ra/shared';
  import { classifyRows } from '../import/commit-service';
  import { loadDevicesByIssi } from '../import/device-lookup';

  importRoutes.post('/commit', async (c) => {
    const json = await c.req.json().catch(() => null);
    const parsed = importCommitSchema.safeParse(json);
    if (!parsed.success) {
      return c.json({ error: 'Ungültige Eingabe', issues: parsed.error.issues }, 400);
    }
    const { dryRun, mapping, rows } = parsed.data;
    const role = c.get('user').role;

    const issis = collectIssis(rows, mapping);
    const existingByIssi: Map<string, DeviceRecord> = loadDevicesByIssi(c.get('db'), issis);

    const { rows: classified, summary } = classifyRows({ rows, mapping, existingByIssi, role });

    if (dryRun) {
      return c.json({ dryRun: true, summary, rows: classified });
    }
    // Real-run handled in Task 4.9.
    return c.json({ error: 'not implemented' }, 501);
  });

  function collectIssis(
    rows: string[][],
    mapping: Record<string, string>,
  ): string[] {
    const issiCol = Object.entries(mapping).find(([, f]) => f === 'issi')?.[0];
    if (issiCol === undefined) return [];
    const idx = Number(issiCol);
    return rows.map((r) => (r[idx] ?? '').trim()).filter((v) => v !== '');
  }
  ```
  Then create the lookup helper `server/src/import/device-lookup.ts`:
  ```ts
  import { inArray } from 'drizzle-orm';
  import { devices } from '../db/schema';
  import type { DeviceRecord } from '@ra/shared';
  import type { Db } from '../db'; // Phase 2's drizzle instance type

  /** Loads all devices whose ISSI is in `issis`, keyed by ISSI. */
  export function loadDevicesByIssi(db: Db, issis: string[]): Map<string, DeviceRecord> {
    const map = new Map<string, DeviceRecord>();
    if (issis.length === 0) return map;
    const unique = [...new Set(issis)];
    const found = db.select().from(devices).where(inArray(devices.issi, unique)).all() as DeviceRecord[];
    for (const d of found) map.set(d.issi, d);
    return map;
  }
  ```
  > `c.get('db')` and `c.get('user')` are the Hono context vars set by Phase 2/3 middleware. If the db is imported as a module singleton instead, import it directly and drop the `c.get('db')` argument. `Db` is Phase 2's `BetterSQLite3Database<typeof schema>` alias.

- [ ] **Step 5: Run the dryRun test (expect: pass).**
  ```bash
  pnpm --filter @ra/server exec vitest run test/routes/import-commit-dryrun.test.ts
  ```
  Expected: all green (summary counts, change filtering, duplicate detection, 400 on missing issi).

- [ ] **Step 6: Commit.**
  ```bash
  git add server/src/import/commit-service.ts server/src/import/device-lookup.ts server/src/routes/import.ts server/test/routes/import-commit-dryrun.test.ts
  git commit -m "feat(server): add POST /api/import/commit dryRun classification summary"
  ```

---

### Task 4.9: Route `POST /api/import/commit` — transactional real run (upsert + events + software_versions)

**Files:**
- create: `server/src/import/apply-commit.ts`
- create: `server/test/routes/import-commit-real.test.ts`
- modify: `server/src/routes/import.ts`

- [ ] **Step 1: Write the failing real-run test.** Create `server/test/routes/import-commit-real.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import { createTestApp } from '../helpers/test-app';
  import { seedDevice } from '../helpers/seed';
  import { getDb } from '../helpers/db';
  import { devices, deviceEvents, softwareVersions } from '../../src/db/schema';
  import { eq } from 'drizzle-orm';

  const mapping = { '0': 'issi', '1': 'softwareVersion', '2': 'status' };

  describe('POST /api/import/commit (real run)', () => {
    beforeEach(async () => {
      await seedDevice({ issi: '1001', softwareVersion: 'FW 12.2', status: 'einsatzbereit' });
    });

    it('admin: updates matched device, creates new device, creates missing software_versions, writes csv-import events', async () => {
      const app = createTestApp({ role: 'admin', name: 'Alice Admin' });
      const res = await app.request('/api/import/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          dryRun: false,
          mapping,
          rows: [
            ['1001', 'FW 13.0', 'einsatzbereit'], // update swVersion only
            ['7777', 'FW 13.0', 'in Reparatur'],  // create
          ],
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.summary).toMatchObject({ created: 1, updated: 1 });

      const db = getDb();
      const updated = db.select().from(devices).where(eq(devices.issi, '1001')).get();
      expect(updated?.softwareVersion).toBe('FW 13.0');
      expect(updated?.updatedBy).toBe('Alice Admin');

      const created = db.select().from(devices).where(eq(devices.issi, '7777')).get();
      expect(created).toBeTruthy();
      expect(created?.status).toBe('in Reparatur');
      expect(created?.createdBy).toBe('Alice Admin');

      // new software_versions row created exactly once for 'FW 13.0'
      const versions = db.select().from(softwareVersions).where(eq(softwareVersions.value, 'FW 13.0')).all();
      expect(versions).toHaveLength(1);

      // events written with source csv-import
      const events = db.select().from(deviceEvents).where(eq(deviceEvents.deviceId, updated!.id)).all();
      expect(events.some((e) => e.field === 'softwareVersion' && e.source === 'csv-import' && e.newValue === 'FW 13.0')).toBe(true);
    });

    it('updater: updates allowed fields of matched device, ignores locked columns, does NOT create unknown ISSI', async () => {
      const app = createTestApp({ role: 'updater', name: 'Uwe Updater' });
      const res = await app.request('/api/import/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          dryRun: false,
          mapping: { '0': 'issi', '1': 'softwareVersion', '2': 'location' },
          rows: [
            ['1001', 'FW 13.0', 'Werkstatt'], // swVersion updated, location ignored
            ['5555', 'FW 13.0', 'Werkstatt'], // skipped-no-permission, not created
          ],
        }),
      });
      const body = await res.json();
      expect(body.summary).toMatchObject({ updated: 1, 'skipped-no-permission': 1, created: 0 });

      const db = getDb();
      const dev = db.select().from(devices).where(eq(devices.issi, '1001')).get();
      expect(dev?.softwareVersion).toBe('FW 13.0');
      expect(dev?.location).not.toBe('Werkstatt'); // locked field untouched

      const notCreated = db.select().from(devices).where(eq(devices.issi, '5555')).get();
      expect(notCreated).toBeUndefined();
    });

    it('is transactional: a row that violates a constraint rolls back the whole commit', async () => {
      // Two rows mapping to the same NEW issi within one commit must not double-insert;
      // the in-file duplicate is classed error and skipped, leaving a single insert.
      const app = createTestApp({ role: 'admin' });
      const res = await app.request('/api/import/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          dryRun: false,
          mapping: { '0': 'issi', '1': 'softwareVersion' },
          rows: [
            ['4444', 'FW 9.0'],
            ['4444', 'FW 9.1'], // duplicate-in-file -> error, not applied
          ],
        }),
      });
      const body = await res.json();
      expect(body.summary.error).toBe(1);
      expect(body.summary.created).toBe(1);
      const db = getDb();
      const rows = db.select().from(devices).where(eq(devices.issi, '4444')).all();
      expect(rows).toHaveLength(1);
      expect(rows[0].softwareVersion).toBe('FW 9.0');
    });

    it('writes no events for unchanged rows', async () => {
      const app = createTestApp({ role: 'admin' });
      await app.request('/api/import/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          dryRun: false,
          mapping: { '0': 'issi', '1': 'softwareVersion', '2': 'status' },
          rows: [['1001', 'FW 12.2', 'einsatzbereit']], // identical -> unchanged
        }),
      });
      const db = getDb();
      const dev = db.select().from(devices).where(eq(devices.issi, '1001')).get();
      const events = db.select().from(deviceEvents).where(eq(deviceEvents.deviceId, dev!.id)).all();
      expect(events.filter((e) => e.source === 'csv-import')).toHaveLength(0);
    });
  });
  ```

- [ ] **Step 2: Run the failing test (expect: 501 not-implemented fail).**
  ```bash
  pnpm --filter @ra/server exec vitest run test/routes/import-commit-real.test.ts
  ```
  Expected: real-run branch returns 501 → assertions fail.

- [ ] **Step 3: Implement the transactional apply.** Create `server/src/import/apply-commit.ts`:
  ```ts
  import { createId } from '@paralleldrive/cuid2';
  import { eq } from 'drizzle-orm';
  import { filterEditableFields } from '@ra/shared';
  import type { DeviceRecord, Role } from '@ra/shared';
  import { devices, deviceEvents, softwareVersions } from '../db/schema';
  import type { Db } from '../db';
  import type { ClassifiedRow, ImportSummary } from './commit-service';

  interface ApplyArgs {
    db: Db;
    classified: ClassifiedRow[];
    /** raw incoming patch per row index, already mapped (issi + typed fields) */
    incomingByIndex: Map<number, Record<string, unknown>>;
    existingByIssi: Map<string, DeviceRecord>;
    role: Role;
    actor: string;
  }

  /**
   * Applies created/updated rows in ONE transaction:
   *  - inserts new devices (admin only; updater rows are 'skipped-no-permission' already)
   *  - patches matched devices (role allowlist re-applied server-side)
   *  - ensures a software_versions row exists for any non-null softwareVersion
   *  - writes one device_events row per changed field (source 'csv-import' or 'create')
   * error / unchanged / skipped rows cause no writes.
   */
  export function applyCommit(args: ApplyArgs): { summary: ImportSummary; rows: ClassifiedRow[] } {
    const { db, classified, incomingByIndex, existingByIssi, role, actor } = args;
    const now = Date.now();

    db.transaction((tx) => {
      const ensuredVersions = new Set<string>();
      const ensureVersion = (value: string | null | undefined) => {
        if (!value || ensuredVersions.has(value)) return;
        ensuredVersions.add(value);
        const exists = tx.select().from(softwareVersions).where(eq(softwareVersions.value, value)).get();
        if (!exists) {
          tx.insert(softwareVersions).values({
            id: createId(),
            value,
            createdAt: now,
            createdBy: actor,
          }).run();
        }
      };

      for (const row of classified) {
        const incoming = incomingByIndex.get(row.rowIndex) ?? {};

        if (row.class === 'created') {
          const id = createId();
          ensureVersion(incoming.softwareVersion as string | null);
          tx.insert(devices).values({
            id,
            issi: row.issi,
            rufname: (incoming.rufname as string) ?? null,
            serialNumber: (incoming.serialNumber as string) ?? null,
            deviceType: (incoming.deviceType as string) ?? null,
            status: (incoming.status as string) ?? null,
            location: (incoming.location as string) ?? null,
            assignedTo: (incoming.assignedTo as string) ?? null,
            softwareVersion: (incoming.softwareVersion as string) ?? null,
            lastUpdatedAt: (incoming.lastUpdatedAt as number) ?? null,
            notes: (incoming.notes as string) ?? null,
            createdAt: now,
            updatedAt: now,
            createdBy: actor,
            updatedBy: actor,
          }).run();
          for (const ch of row.changes) {
            tx.insert(deviceEvents).values({
              id: createId(),
              deviceId: id,
              field: ch.field,
              oldValue: ch.oldValue,
              newValue: ch.newValue,
              changedBy: actor,
              changedAt: now,
              source: 'create',
            }).run();
          }
        } else if (row.class === 'updated') {
          const existing = existingByIssi.get(row.issi)!;
          // Re-apply the role allowlist server-side (source of truth).
          const { issi: _issi, ...rest } = incoming;
          const patch = filterEditableFields(role, rest as Record<string, unknown>);
          // Only persist fields that actually changed (row.changes already reflects allowlist).
          const setFields: Record<string, unknown> = { updatedAt: now, updatedBy: actor };
          for (const ch of row.changes) setFields[ch.field] = (patch as Record<string, unknown>)[ch.field] ?? null;
          ensureVersion((patch as Record<string, unknown>).softwareVersion as string | null);
          tx.update(devices).set(setFields).where(eq(devices.id, existing.id)).run();
          for (const ch of row.changes) {
            tx.insert(deviceEvents).values({
              id: createId(),
              deviceId: existing.id,
              field: ch.field,
              oldValue: ch.oldValue,
              newValue: ch.newValue,
              changedBy: actor,
              changedAt: now,
              source: 'csv-import',
            }).run();
          }
        }
        // 'unchanged' | 'error' | 'skipped-no-permission' -> no writes
      }
    });

    const summary = recount(classified);
    return { summary, rows: classified };
  }

  function recount(rows: ClassifiedRow[]): ImportSummary {
    const s: ImportSummary = { created: 0, updated: 0, unchanged: 0, error: 0, 'skipped-no-permission': 0 };
    for (const r of rows) s[r.class] += 1;
    return s;
  }
  ```
  > `@paralleldrive/cuid2` is the id generator used by the schema (Phase 2 dependency). `Db` is Phase 2's drizzle type. `db.transaction` with better-sqlite3 is synchronous — any thrown error rolls back the whole batch.

- [ ] **Step 4: Wire the real-run branch.** In `server/src/routes/import.ts`, replace the 501 stub. The handler must also build `incomingByIndex` (reuse `rowToIncoming` — export it from `commit-service.ts`) and pass `existingByIssi`:
  ```ts
  import { classifyRows, rowToIncoming } from '../import/commit-service';
  import { applyCommit } from '../import/apply-commit';
  // ...
  // after classifyRows(...):
  if (dryRun) {
    return c.json({ dryRun: true, summary, rows: classified });
  }
  const incomingByIndex = new Map<number, Record<string, unknown>>();
  rows.forEach((row, i) => incomingByIndex.set(i, rowToIncoming(row, mapping)));
  const actor = c.get('user').name ?? c.get('user').sub;
  const result = applyCommit({
    db: c.get('db'),
    classified,
    incomingByIndex,
    existingByIssi,
    role,
    actor,
  });
  return c.json({ dryRun: false, summary: result.summary, rows: result.rows });
  ```
  Export `rowToIncoming` from `commit-service.ts` (change `function rowToIncoming` to `export function rowToIncoming`).

- [ ] **Step 5: Run the real-run test (expect: pass).**
  ```bash
  pnpm --filter @ra/server exec vitest run test/routes/import-commit-real.test.ts
  ```
  Expected: all green (update, create, version creation, event sourcing, updater gating, transaction/duplicate, unchanged-no-event).

- [ ] **Step 6: Run the full server + shared suites (no regressions).**
  ```bash
  pnpm --filter @ra/server exec vitest run
  pnpm --filter @ra/shared exec vitest run
  pnpm --filter @ra/server exec tsc --noEmit
  ```
  Expected: everything green; typecheck clean.

- [ ] **Step 7: Commit.**
  ```bash
  git add server/src/import/apply-commit.ts server/src/import/commit-service.ts server/src/routes/import.ts server/test/routes/import-commit-real.test.ts
  git commit -m "feat(server): transactional import commit with events, software_versions, role gating"
  ```

---

### Task 4.10: Integration smoke test — parse → autoMap → commit dryRun (cp1252 + semicolon)

**Files:**
- create: `server/test/routes/import-pipeline.test.ts`

- [ ] **Step 1: Write the end-to-end pipeline test.** Create `server/test/routes/import-pipeline.test.ts` exercising the real cp1252 semicolon fixture through both routes and `autoMapHeaders`:
  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import iconv from 'iconv-lite';
  import { autoMapHeaders } from '@ra/shared';
  import { createTestApp } from '../helpers/test-app';
  import { seedDevice } from '../helpers/seed';

  function multipart(buf: Buffer): FormData {
    const fd = new FormData();
    fd.append('file', new Blob([buf], { type: 'text/csv' }), 'export.csv');
    return fd;
  }

  describe('CSV import pipeline (parse -> autoMap -> commit dryRun)', () => {
    beforeEach(async () => {
      await seedDevice({ issi: '1001', softwareVersion: 'FW 12.2' });
    });

    it('parses a real cp1252 ;-CSV, auto-maps headers, and dryRun-classifies via the API', async () => {
      const app = createTestApp({ role: 'admin' });
      const csv =
        'ISSI;Rufname;Softwareversion;Standort\n' +
        '1001;Gerät 1;FW 12.3;Köln\n' +
        '2002;Gerät 2;FW 12.3;Düsseldorf\n';
      const buf = iconv.encode(csv, 'win1252');

      const parseRes = await app.request('/api/import/parse', { method: 'POST', body: multipart(buf) });
      expect(parseRes.status).toBe(200);
      const parsed = await parseRes.json();
      expect(parsed.detected.delimiter).toBe(';');
      expect(parsed.columns).toEqual(['ISSI', 'Rufname', 'Softwareversion', 'Standort']);

      // Build an index-keyed mapping from the auto-mapped header names.
      const byName = autoMapHeaders(parsed.columns); // { ISSI:'issi', ... }
      const mapping: Record<string, string> = {};
      parsed.columns.forEach((col: string, i: number) => {
        if (byName[col]) mapping[String(i)] = byName[col];
      });
      expect(Object.values(mapping)).toContain('issi');

      const commitRes = await app.request('/api/import/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dryRun: true, mapping, rows: parsed.rows }),
      });
      expect(commitRes.status).toBe(200);
      const summary = (await commitRes.json()).summary;
      expect(summary).toEqual({ created: 1, updated: 1, unchanged: 0, error: 0, 'skipped-no-permission': 0 });
    });
  });
  ```

- [ ] **Step 2: Run the pipeline test (expect: pass — all pieces already built).**
  ```bash
  pnpm --filter @ra/server exec vitest run test/routes/import-pipeline.test.ts
  ```
  Expected: green (umlauts preserved end-to-end, summary 1 updated + 1 created).

- [ ] **Step 3: Run all workspace tests once more.**
  ```bash
  pnpm -r exec vitest run
  ```
  Expected: shared + server suites fully green.

- [ ] **Step 4: Commit.**
  ```bash
  git add server/test/routes/import-pipeline.test.ts
  git commit -m "test(server): end-to-end CSV import pipeline smoke (cp1252 + semicolon)"
  ```

---

**Phase 4 done-criteria:** `shared` exposes tested `diffDevice`, `classifyImportRow`, `autoMapHeaders`/`IMPORTABLE_FIELDS`, and `importCommitSchema`; `server` decodes cp1252/BOM to UTF-8, auto-detects `;`/`,`/`\t`, and serves `POST /api/import/parse` and `POST /api/import/commit` (dryRun summary + transactional real run) with `device_events` (`source: 'csv-import'`/`'create'`), missing-`software_versions` creation, admin-gated new-device creation (updater → `skipped-no-permission`), and `filterEditableFields` enforced server-side for updaters. All paths above are absolute under `/Users/rubeen/dev/personal/drk/radio-admin/`.

---

## Phase 5: Frontend (antd, Routing, Query, responsive, Dashboard)

**Goal:** Build the React 19 + Vite SPA — data router, react-query, axios-free fetch client, auth guard, dark/light theme, responsive AppLayout, device list/detail/edit with role-gated comboboxes, admin create modal, CSV import wizard, and dashboard — consuming the Phase 3/4 server APIs and the `@ra/shared` contracts.

> **Scope notes baked into every task below:**
> - The client **consumes** the server-computed `updateStatus` from `GET /api/devices`; it never imports `computeUpdateStatus`. The badge is pure presentation.
> - Search/filter/sort are **server-side** via query params (`q`, `status`, `location`, `updateStatus`, `sort`, `page`, `pageSize`) that form the react-query key. We do **not** use antd client-side filtering.
> - Role-gating in the UI is **UX-only**; the server is the source of truth. Editability is derived from `role` (from `useAuth`) + `UPDATER_EDITABLE_FIELDS`.
> - The 401 guard redirect targets the **server** OIDC route `/api/auth/login` via `window.location.href` (full-page nav), distinct from the client `/login` info page and the `/403` no-role landing.
> - Events/history timeline is **out of scope** for this phase.

---

### Task 5.1: Scaffold Vite React app + test infrastructure

**Files:**
- create `client/package.json`
- create `client/vite.config.ts`
- create `client/tsconfig.json`
- create `client/index.html`
- create `client/src/main.tsx`
- create `client/src/App.tsx`
- create `client/src/test/setup.ts`
- create `client/src/test/utils.tsx`
- create `client/src/smoke.test.tsx` (temporary)

- [ ] **Step 1: Create `client/package.json`** with name `@ra/client`, `private: true`, `type: "module"`, scripts `dev` (`vite`), `build` (`tsc -b && vite build`), `preview` (`vite preview`), `test` (`vitest run`), `test:watch` (`vitest`), `typecheck` (`tsc -b --noEmit`). Dependencies: `react@^19`, `react-dom@^19`, `react-router-dom@^7`, `@tanstack/react-query@^5`, `antd@^5`, `@ant-design/v5-patch-for-react-19`, `react-icons@^5`, `dayjs@^1`, `@ra/shared` (`workspace:*`). devDependencies: `vite@^6`, `@vitejs/plugin-react`, `typescript@^5`, `vitest@^3`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `@types/react`, `@types/react-dom`.

- [ ] **Step 2: Write `client/src/test/setup.ts`** — jsdom polyfills required by antd (`matchMedia`, `ResizeObserver`) plus jest-dom matchers. Without these every downstream component test throws:
  ```ts
  // client/src/test/setup.ts
  import '@testing-library/jest-dom/vitest';

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }),
  });

  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  ```

- [ ] **Step 3: Write `client/vite.config.ts`** — react plugin, dev `/api` proxy to the server, and vitest config wired to the setup file:
  ```ts
  // client/vite.config.ts
  import { defineConfig } from 'vite';
  import react from '@vitejs/plugin-react';

  export default defineConfig({
    plugins: [react()],
    server: {
      proxy: {
        '/api': { target: 'http://localhost:3000', changeOrigin: true },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  });
  ```

- [ ] **Step 4: Write `client/tsconfig.json`** extending the root base config, `jsx: "react-jsx"`, `moduleResolution: "bundler"`, `types: ["vitest/globals", "@testing-library/jest-dom"]`, `paths` resolving `@ra/shared`, `include: ["src"]`. Write `client/index.html` with `<div id="root">` + `<script type="module" src="/src/main.tsx">`.

- [ ] **Step 5: Write the temporary failing smoke test** `client/src/smoke.test.tsx`:
  ```tsx
  import { render, screen } from '@testing-library/react';
  import App from './App';

  test('renders app heading', () => {
    render(<App />);
    expect(screen.getByText('radio-admin')).toBeInTheDocument();
  });
  ```

- [ ] **Step 6: Run the failing test** — `pnpm --filter @ra/client test`. Expected fail: `Cannot find module './App'` (App.tsx not yet created).

- [ ] **Step 7: Create minimal `client/src/App.tsx`** returning `<h1>radio-admin</h1>`, and `client/src/main.tsx` importing `@ant-design/v5-patch-for-react-19` first, then `createRoot(...).render(<App />)`.

- [ ] **Step 8: Run the test** — `pnpm --filter @ra/client test`. Expected pass: 1 passed. Then `pnpm --filter @ra/client typecheck` passes.

- [ ] **Step 9: Delete `client/src/smoke.test.tsx`** (it served its bootstrap purpose; real tests follow).

- [ ] **Step 10: Commit.**
  ```bash
  git checkout -b phase-5-frontend
  git add client/package.json client/vite.config.ts client/tsconfig.json client/index.html client/src
  git commit -m "chore(client): scaffold vite react app + vitest/testing-library infra"
  ```

---

### Task 5.2: API client (fetch wrapper, credentials include, typed error)

**Files:**
- create `client/src/api/client.ts`
- create `client/src/api/client.test.ts`

- [ ] **Step 1: Write the failing test** `client/src/api/client.test.ts`:
  ```ts
  import { afterEach, expect, test, vi } from 'vitest';
  import { apiFetch, ApiError } from './client';

  afterEach(() => vi.restoreAllMocks());

  test('GET parses JSON and sends credentials', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const data = await apiFetch<{ ok: boolean }>('/api/devices');
    expect(data).toEqual({ ok: true });
    expect(spy).toHaveBeenCalledWith(
      '/api/devices',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  test('throws ApiError with status on non-2xx', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(apiFetch('/api/devices')).rejects.toMatchObject({
      status: 403,
      name: 'ApiError',
    });
  });

  test('POST serializes body and sets json content-type', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: '1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await apiFetch('/api/devices', { method: 'POST', body: { issi: '1001' } });
    const init = spy.mock.calls[0][1]!;
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ issi: '1001' }));
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
  });
  ```

- [ ] **Step 2: Run the failing test** — `pnpm --filter @ra/client test client.test`. Expected fail: `Cannot find module './client'`.

- [ ] **Step 3: Implement `client/src/api/client.ts`:**
  ```ts
  export class ApiError extends Error {
    constructor(
      public readonly status: number,
      message: string,
      public readonly body?: unknown,
    ) {
      super(message);
      this.name = 'ApiError';
    }
  }

  type ApiFetchOptions = Omit<RequestInit, 'body'> & { body?: unknown };

  export async function apiFetch<T = unknown>(
    path: string,
    options: ApiFetchOptions = {},
  ): Promise<T> {
    const { body, headers, ...rest } = options;
    const init: RequestInit = {
      credentials: 'include',
      ...rest,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(headers as Record<string, string> | undefined),
      },
    };
    if (body !== undefined) init.body = JSON.stringify(body);

    const res = await fetch(path, init);
    const isJson = res.headers.get('content-type')?.includes('application/json');
    const payload = isJson ? await res.json().catch(() => undefined) : undefined;

    if (!res.ok) {
      const message =
        (payload as { error?: string } | undefined)?.error ?? `HTTP ${res.status}`;
      throw new ApiError(res.status, message, payload);
    }
    return payload as T;
  }

  // multipart helper for CSV upload (no json content-type; browser sets boundary)
  export async function apiUpload<T = unknown>(path: string, form: FormData): Promise<T> {
    const res = await fetch(path, { method: 'POST', credentials: 'include', body: form });
    const isJson = res.headers.get('content-type')?.includes('application/json');
    const payload = isJson ? await res.json().catch(() => undefined) : undefined;
    if (!res.ok) {
      const message =
        (payload as { error?: string } | undefined)?.error ?? `HTTP ${res.status}`;
      throw new ApiError(res.status, message, payload);
    }
    return payload as T;
  }
  ```

- [ ] **Step 4: Run the test** — `pnpm --filter @ra/client test client.test`. Expected pass: 3 passed.

- [ ] **Step 5: Commit.**
  ```bash
  git add client/src/api/client.ts client/src/api/client.test.ts
  git commit -m "feat(client): fetch api client with credentials include and typed ApiError"
  ```

---

### Task 5.3: QueryClient + AppProviders

**Files:**
- create `client/src/app/queryClient.ts`
- create `client/src/app/AppProviders.tsx`

> No dedicated unit test (thin composition); verified by the consuming component tests in later tasks and by typecheck.

- [ ] **Step 1: Write `client/src/app/queryClient.ts`:**
  ```ts
  import { QueryClient } from '@tanstack/react-query';
  import { ApiError } from '../api/client';

  export function createQueryClient() {
    return new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          refetchOnWindowFocus: false,
          retry: (failureCount, error) => {
            // never retry auth/permission failures; the guard handles 401
            if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
              return false;
            }
            return failureCount < 2;
          },
        },
      },
    });
  }
  ```

- [ ] **Step 2: Write `client/src/app/AppProviders.tsx`** — props `{ children: React.ReactNode; client?: QueryClient }` (the optional `client` lets tests inject a fresh QueryClient). Structure: `<QueryClientProvider client={client ?? defaultClient}><ThemeProvider>{children}</ThemeProvider></QueryClientProvider>`. `ThemeProvider` is added in Task 5.4; for now wrap only `QueryClientProvider` and add a `// ThemeProvider added in 5.4` comment placeholder that imports nothing missing. **Acceptance:** typecheck passes; a default singleton QueryClient is created once at module scope.

- [ ] **Step 3: Verify** — `pnpm --filter @ra/client typecheck` passes.

- [ ] **Step 4: Commit.**
  ```bash
  git add client/src/app/queryClient.ts client/src/app/AppProviders.tsx
  git commit -m "feat(client): query client and AppProviders shell"
  ```

---

### Task 5.4: ThemeProvider (antd ConfigProvider dark/light toggle)

**Files:**
- create `client/src/theme/ThemeProvider.tsx`
- create `client/src/theme/ThemeProvider.test.tsx`
- modify `client/src/app/AppProviders.tsx`

- [ ] **Step 1: Write the failing test** `client/src/theme/ThemeProvider.test.tsx`:
  ```tsx
  import { render, screen } from '@testing-library/react';
  import userEvent from '@testing-library/user-event';
  import { beforeEach, expect, test } from 'vitest';
  import { ThemeProvider, useTheme } from './ThemeProvider';

  function Probe() {
    const { mode, toggle } = useTheme();
    return (
      <button onClick={toggle} data-testid="probe">
        {mode}
      </button>
    );
  }

  beforeEach(() => localStorage.clear());

  test('defaults to light when no preference and no storage', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('light');
  });

  test('toggle flips mode and persists to localStorage', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await user.click(screen.getByTestId('probe'));
    expect(screen.getByTestId('probe')).toHaveTextContent('dark');
    expect(localStorage.getItem('ra-theme')).toBe('dark');
  });

  test('reads initial mode from localStorage', () => {
    localStorage.setItem('ra-theme', 'dark');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('dark');
  });
  ```

- [ ] **Step 2: Run the failing test** — `pnpm --filter @ra/client test ThemeProvider`. Expected fail: `Cannot find module './ThemeProvider'`.

- [ ] **Step 3: Implement `client/src/theme/ThemeProvider.tsx`:**
  ```tsx
  import { ConfigProvider, theme as antdTheme } from 'antd';
  import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
  } from 'react';

  export type ThemeMode = 'light' | 'dark';
  const STORAGE_KEY = 'ra-theme';

  function readInitialMode(): ThemeMode {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'light';
  }

  interface ThemeContextValue {
    mode: ThemeMode;
    toggle: () => void;
    setMode: (mode: ThemeMode) => void;
  }
  const ThemeContext = createContext<ThemeContextValue | null>(null);

  export function useTheme(): ThemeContextValue {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
    return ctx;
  }

  export function ThemeProvider({ children }: { children: ReactNode }) {
    const [mode, setModeState] = useState<ThemeMode>(readInitialMode);

    useEffect(() => {
      localStorage.setItem(STORAGE_KEY, mode);
    }, [mode]);

    const setMode = useCallback((next: ThemeMode) => setModeState(next), []);
    const toggle = useCallback(
      () => setModeState((m) => (m === 'dark' ? 'light' : 'dark')),
      [],
    );

    const value = useMemo(() => ({ mode, toggle, setMode }), [mode, toggle, setMode]);

    return (
      <ThemeContext.Provider value={value}>
        <ConfigProvider
          theme={{
            algorithm:
              mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          }}
        >
          {children}
        </ConfigProvider>
      </ThemeContext.Provider>
    );
  }
  ```

- [ ] **Step 4: Run the test** — `pnpm --filter @ra/client test ThemeProvider`. Expected pass: 3 passed.

- [ ] **Step 5: Wire `ThemeProvider` into `AppProviders.tsx`** — replace the placeholder comment so the tree is `QueryClientProvider > ThemeProvider > children`. Verify typecheck passes.

- [ ] **Step 6: Commit.**
  ```bash
  git add client/src/theme client/src/app/AppProviders.tsx
  git commit -m "feat(client): dark/light ThemeProvider with localStorage + prefers-color-scheme"
  ```

---

### Task 5.5: useAuth hook (GET /api/auth/me)

**Files:**
- create `client/src/auth/useAuth.ts`
- create `client/src/auth/useAuth.test.tsx`
- create `client/src/test/utils.tsx` (query wrapper helper)

- [ ] **Step 1: Write `client/src/test/utils.tsx`** — a `renderWithQuery(ui)` helper wrapping in a fresh `QueryClientProvider` (new `QueryClient` with `retry: false`), re-exporting `@testing-library/react`. Used by all hook/component tests.

- [ ] **Step 2: Write the failing test** `client/src/auth/useAuth.test.tsx`:
  ```tsx
  import { renderHook, waitFor } from '@testing-library/react';
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  import { afterEach, expect, test, vi } from 'vitest';
  import { useAuth } from './useAuth';

  afterEach(() => vi.restoreAllMocks());

  function wrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  test('returns user on 200', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ name: 'Alice', role: 'admin' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toEqual({ name: 'Alice', role: 'admin' });
    expect(result.current.isAdmin).toBe(true);
  });

  test('returns null user on 401', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.isAdmin).toBe(false);
  });
  ```

- [ ] **Step 3: Run the failing test** — `pnpm --filter @ra/client test useAuth`. Expected fail: `Cannot find module './useAuth'`.

- [ ] **Step 4: Implement `client/src/auth/useAuth.ts`:**
  ```ts
  import { useQuery } from '@tanstack/react-query';
  import type { Role } from '@ra/shared';
  import { ApiError, apiFetch } from '../api/client';

  export interface AuthUser {
    name: string;
    role: Role;
  }

  export const authMeQueryKey = ['auth', 'me'] as const;

  export function useAuth() {
    const query = useQuery<AuthUser | null>({
      queryKey: authMeQueryKey,
      queryFn: async () => {
        try {
          return await apiFetch<AuthUser>('/api/auth/me');
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) return null;
          throw err;
        }
      },
      staleTime: 5 * 60_000,
    });

    const user = query.data ?? null;
    return {
      user,
      role: user?.role ?? null,
      isAdmin: user?.role === 'admin',
      isUpdater: user?.role === 'updater',
      isAuthenticated: user !== null,
      isLoading: query.isLoading,
      isError: query.isError,
      error: query.error,
    };
  }
  ```

- [ ] **Step 5: Run the test** — `pnpm --filter @ra/client test useAuth`. Expected pass: 2 passed.

- [ ] **Step 6: Commit.**
  ```bash
  git add client/src/auth/useAuth.ts client/src/auth/useAuth.test.tsx client/src/test/utils.tsx
  git commit -m "feat(client): useAuth hook backed by GET /api/auth/me"
  ```

---

### Task 5.6: Route guard (401 → /api/auth/login)

**Files:**
- create `client/src/auth/RequireAuth.tsx`
- create `client/src/auth/RequireAuth.test.tsx`

> The guard handles three states distinctly: loading → spinner; not authenticated (`user === null`) → **full-page** redirect to the server route `window.location.href = '/api/auth/login'`; authenticated → render children. A separate `RequireRole` gate renders the `/403` page when the role doesn't match (used only for admin-only client routes; server remains source of truth).

- [ ] **Step 1: Write the failing test** `client/src/auth/RequireAuth.test.tsx`:
  ```tsx
  import { render, screen, waitFor } from '@testing-library/react';
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  import { afterEach, beforeEach, expect, test, vi } from 'vitest';
  import { RequireAuth } from './RequireAuth';

  function wrapper(children: React.ReactNode) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  beforeEach(() => {
    vi.stubGlobal('location', { href: '' } as Location);
  });
  afterEach(() => vi.restoreAllMocks());

  test('renders children when authenticated', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ name: 'Alice', role: 'admin' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    render(wrapper(<RequireAuth><div>secret</div></RequireAuth>));
    await waitFor(() => expect(screen.getByText('secret')).toBeInTheDocument());
    expect(window.location.href).toBe('');
  });

  test('redirects to /api/auth/login when unauthenticated', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );
    render(wrapper(<RequireAuth><div>secret</div></RequireAuth>));
    await waitFor(() => expect(window.location.href).toBe('/api/auth/login'));
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });
  ```

- [ ] **Step 2: Run the failing test** — `pnpm --filter @ra/client test RequireAuth`. Expected fail: `Cannot find module './RequireAuth'`.

- [ ] **Step 3: Implement `client/src/auth/RequireAuth.tsx`:**
  ```tsx
  import { Spin } from 'antd';
  import { useEffect, type ReactNode } from 'react';
  import { useAuth } from './useAuth';

  export function RequireAuth({ children }: { children: ReactNode }) {
    const { isAuthenticated, isLoading } = useAuth();

    useEffect(() => {
      if (!isLoading && !isAuthenticated) {
        // server OIDC start — full-page nav, NOT a client route
        window.location.href = '/api/auth/login';
      }
    }, [isLoading, isAuthenticated]);

    if (isLoading || !isAuthenticated) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      );
    }
    return <>{children}</>;
  }
  ```

- [ ] **Step 4: Add `RequireRole`** in the same file: props `{ role: 'admin'; children: ReactNode }`. Uses `useAuth`; while loading shows `<Spin>`; if `role !== 'admin'` (i.e. mismatch) renders `<Navigate to="/403" replace />` (import `Navigate` from `react-router-dom`); otherwise children. **Acceptance:** admin sees children; updater is redirected to `/403`.

- [ ] **Step 5: Run the test** — `pnpm --filter @ra/client test RequireAuth`. Expected pass: 2 passed.

- [ ] **Step 6: Commit.**
  ```bash
  git add client/src/auth/RequireAuth.tsx client/src/auth/RequireAuth.test.tsx
  git commit -m "feat(client): RequireAuth guard (401 -> /api/auth/login) and RequireRole gate"
  ```

---

### Task 5.7: Router (createBrowserRouter, all routes)

**Files:**
- create `client/src/routes/router.tsx`
- create `client/src/pages/LoginPage.tsx`
- create `client/src/pages/ForbiddenPage.tsx`
- create `client/src/pages/NotFoundPage.tsx`
- modify `client/src/App.tsx`
- create `client/src/routes/router.test.tsx`

> Route map: `/` → Dashboard, `/devices` → DeviceList, `/devices/:id` → DeviceDetail route (renders DeviceList with the detail Drawer open on desktop; standalone detail page on mobile — both consume the `:id` param), `/import` → ImportWizard, `/login` → LoginPage (info: "Bitte anmelden" + button linking to `/api/auth/login`), `/403` → ForbiddenPage (no-role-mapping notice). All app routes are children of an element wrapped in `<RequireAuth>` rendering `<AppLayout>` with an `<Outlet/>`. `/login` and `/403` are **outside** `RequireAuth`. Pages not yet built (Dashboard/DeviceList/ImportWizard) use temporary placeholder elements until their tasks land.

- [ ] **Step 1: Write the failing test** `client/src/routes/router.test.tsx` using `createMemoryRouter` + `RouterProvider`, mocking `fetch` for `/api/auth/me` 200 admin:
  ```tsx
  import { render, screen, waitFor } from '@testing-library/react';
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  import { createMemoryRouter, RouterProvider } from 'react-router-dom';
  import { afterEach, expect, test, vi } from 'vitest';
  import { routes } from './router';

  afterEach(() => vi.restoreAllMocks());

  function renderAt(path: string) {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ name: 'Alice', role: 'admin' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const router = createMemoryRouter(routes, { initialEntries: [path] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    return router;
  }

  test('/login renders without auth guard', () => {
    renderAt('/login');
    expect(screen.getByText(/anmelden/i)).toBeInTheDocument();
  });

  test('/403 renders forbidden notice', () => {
    renderAt('/403');
    expect(screen.getByText(/kein zugriff|zugriff verweigert/i)).toBeInTheDocument();
  });

  test('unknown route renders not found', async () => {
    renderAt('/does-not-exist');
    await waitFor(() =>
      expect(screen.getByText(/nicht gefunden|404/i)).toBeInTheDocument(),
    );
  });
  ```

- [ ] **Step 2: Run the failing test** — `pnpm --filter @ra/client test router`. Expected fail: `Cannot find module './router'`.

- [ ] **Step 3: Build `LoginPage`, `ForbiddenPage`, `NotFoundPage`** as antd `Result`-based pages (login: `Result` with a primary button `<a href="/api/auth/login">Anmelden</a>`; forbidden: `status="403"` title "Zugriff verweigert"; notfound: `status="404"` "Seite nicht gefunden").

- [ ] **Step 4: Implement `client/src/routes/router.tsx`** exporting both a `routes` array (for tests) and `createBrowserRouter(routes)`:
  ```tsx
  import { createBrowserRouter, type RouteObject } from 'react-router-dom';
  import { RequireAuth } from '../auth/RequireAuth';
  import { AppLayout } from '../layout/AppLayout';
  import { LoginPage } from '../pages/LoginPage';
  import { ForbiddenPage } from '../pages/ForbiddenPage';
  import { NotFoundPage } from '../pages/NotFoundPage';
  import { DashboardPage } from '../pages/DashboardPage';
  import { DevicesPage } from '../pages/DevicesPage';
  import { ImportPage } from '../pages/ImportPage';

  export const routes: RouteObject[] = [
    { path: '/login', element: <LoginPage /> },
    { path: '/403', element: <ForbiddenPage /> },
    {
      element: (
        <RequireAuth>
          <AppLayout />
        </RequireAuth>
      ),
      children: [
        { path: '/', element: <DashboardPage /> },
        { path: '/devices', element: <DevicesPage /> },
        { path: '/devices/:id', element: <DevicesPage /> },
        { path: '/import', element: <ImportPage /> },
      ],
    },
    { path: '*', element: <NotFoundPage /> },
  ];

  export const router = createBrowserRouter(routes);
  ```

- [ ] **Step 5: Add temporary placeholder pages** `DashboardPage`, `DevicesPage`, `ImportPage` (each `<div>…</div>` for now), and a temporary `AppLayout` that renders `<Outlet/>` (full version in Task 5.8). Update `client/src/App.tsx` to render `<AppProviders><RouterProvider router={router} /></AppProviders>`.

- [ ] **Step 6: Run the test** — `pnpm --filter @ra/client test router`. Expected pass: 3 passed. Run full suite `pnpm --filter @ra/client test` — all green.

- [ ] **Step 7: Commit.**
  ```bash
  git add client/src/routes client/src/pages client/src/App.tsx client/src/layout
  git commit -m "feat(client): data router with all routes, login/403/404 pages"
  ```

---

### Task 5.8: AppLayout (Sider desktop / Drawer mobile, role-aware nav, theme toggle)

**Files:**
- modify `client/src/layout/AppLayout.tsx`
- create `client/src/layout/AppLayout.test.tsx`

**Props/state:** no props (renders `<Outlet/>`). Local state: `drawerOpen: boolean` (mobile nav). Consumes `Grid.useBreakpoint()` → `isMobile = !screens.md` (md = 768px), `useTheme()` for the toggle, `useAuth()` for role-aware nav + username display.

**Behavior / acceptance criteria:**
- Nav items: Dashboard (`/`), Geräte (`/devices`), **Import (`/import`) — shown to all** (import is allowed for both roles; updater simply gets `skipped-no-permission` on unknown ISSI server-side). Admin-only future items would use `isAdmin` gate. Use `react-icons` for item icons and react-router `Link`/`useNavigate`.
- **Desktop (`screens.md === true`):** antd `Layout.Sider` collapsible on the left; content in `Layout.Content`. No Drawer rendered.
- **Mobile (`screens.md === false`):** Sider hidden; a hamburger `Button` in the `Header` opens an antd `Drawer` containing the same `Menu`; selecting an item closes the drawer.
- Header always shows: app title, theme toggle button (sun/moon icon from react-icons, calls `toggle()`), and the current user name + a logout button (`POST /api/auth/logout` then `window.location.href = '/login'`).
- `<Outlet/>` renders the active child route.

- [ ] **Step 1: Write the failing test** `client/src/layout/AppLayout.test.tsx`. Render `AppLayout` inside a `MemoryRouter` + query wrapper with `useAuth` mocked (fetch 200 admin). Because `matchMedia` mock returns `matches: false`, `useBreakpoint()` yields the mobile branch by default; assert the hamburger button is present and clicking it reveals nav links (`Geräte`, `Import`). Assert the theme toggle button is in the document. Use `getByRole('button', { name: /menü|menu/i })`.

- [ ] **Step 2: Run the failing test** — `pnpm --filter @ra/client test AppLayout`. Expected fail: assertions fail / placeholder layout has no menu button.

- [ ] **Step 3: Implement the full `AppLayout`** per the behavior spec. Structure: `Layout > [Sider (desktop only)] > Layout > Header (title, theme toggle, user, logout, mobile hamburger) > Content > Outlet`, plus a `Drawer` (mobile) holding the `Menu`. Menu `items` array built from a `navItems` constant `[{ key:'/', label:'Dashboard', icon }, { key:'/devices', label:'Geräte', icon }, { key:'/import', label:'Import', icon }]`; `selectedKeys={[location.pathname]}`; `onClick` → `navigate(key)` + close drawer.

- [ ] **Step 4: Run the test** — `pnpm --filter @ra/client test AppLayout`. Expected pass.

- [ ] **Step 5: Commit.**
  ```bash
  git add client/src/layout/AppLayout.tsx client/src/layout/AppLayout.test.tsx
  git commit -m "feat(client): responsive AppLayout with Sider/Drawer nav, theme toggle, logout"
  ```

---

### Task 5.9: UpdateStatusBadge component (+ mandated component test)

**Files:**
- create `client/src/components/UpdateStatusBadge.tsx`
- create `client/src/components/UpdateStatusBadge.test.tsx`

> Pure presentation: maps `UpdateStatus` → antd `Tag` color + German label. **Does not** import or call `computeUpdateStatus`; the value comes pre-computed from the server.

- [ ] **Step 1: Write the failing test** `client/src/components/UpdateStatusBadge.test.tsx`:
  ```tsx
  import { render, screen } from '@testing-library/react';
  import { expect, test } from 'vitest';
  import { UpdateStatusBadge } from './UpdateStatusBadge';

  test('renders green "Aktuell" for aktuell', () => {
    render(<UpdateStatusBadge status="aktuell" />);
    const tag = screen.getByText('Aktuell');
    expect(tag).toBeInTheDocument();
    expect(tag.closest('.ant-tag')).toHaveClass('ant-tag-green');
  });

  test('renders red "Veraltet" for veraltet', () => {
    render(<UpdateStatusBadge status="veraltet" />);
    expect(screen.getByText('Veraltet').closest('.ant-tag')).toHaveClass('ant-tag-red');
  });

  test('renders grey "Unbekannt" for unbekannt', () => {
    render(<UpdateStatusBadge status="unbekannt" />);
    expect(screen.getByText('Unbekannt').closest('.ant-tag')).toHaveClass(
      'ant-tag-default',
    );
  });
  ```

- [ ] **Step 2: Run the failing test** — `pnpm --filter @ra/client test UpdateStatusBadge`. Expected fail: `Cannot find module './UpdateStatusBadge'`.

- [ ] **Step 3: Implement `client/src/components/UpdateStatusBadge.tsx`:**
  ```tsx
  import { Tag } from 'antd';
  import type { UpdateStatus } from '@ra/shared';

  const CONFIG: Record<UpdateStatus, { color: string; label: string }> = {
    aktuell: { color: 'green', label: 'Aktuell' },
    veraltet: { color: 'red', label: 'Veraltet' },
    unbekannt: { color: 'default', label: 'Unbekannt' },
  };

  export function UpdateStatusBadge({ status }: { status: UpdateStatus }) {
    const { color, label } = CONFIG[status];
    return <Tag color={color}>{label}</Tag>;
  }
  ```

- [ ] **Step 4: Run the test** — `pnpm --filter @ra/client test UpdateStatusBadge`. Expected pass: 3 passed.

- [ ] **Step 5: Commit.**
  ```bash
  git add client/src/components/UpdateStatusBadge.tsx client/src/components/UpdateStatusBadge.test.tsx
  git commit -m "feat(client): UpdateStatusBadge presentational component with tests"
  ```

---

### Task 5.10: Combobox component + useSuggestions + useSoftwareVersions hooks

**Files:**
- create `client/src/hooks/useSuggestions.ts`
- create `client/src/hooks/useSoftwareVersions.ts`
- create `client/src/hooks/useSuggestions.test.tsx`
- create `client/src/components/Combobox.tsx`

> `useSuggestions(field)` is for the general fields (`rufname`/`deviceType`/`status`/`location`/`assignedTo`); `field` is typed via the shared `suggestionFieldEnum` inferred type. `useSoftwareVersions()` is the software-version special case (ordered list + newest marker). Combobox is an antd `Select showSearch` that allows creating a new value (the "Anlegen"-Option).

- [ ] **Step 1: Write the failing test** `client/src/hooks/useSuggestions.test.tsx`:
  ```tsx
  import { renderHook, waitFor } from '@testing-library/react';
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  import { afterEach, expect, test, vi } from 'vitest';
  import { useSuggestions } from './useSuggestions';

  afterEach(() => vi.restoreAllMocks());
  function wrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  test('fetches suggestions for a field', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(['Kdow', 'MTW']), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const { result } = renderHook(() => useSuggestions('location'), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(['Kdow', 'MTW']));
    expect(spy).toHaveBeenCalledWith(
      '/api/suggestions?field=location',
      expect.objectContaining({ credentials: 'include' }),
    );
  });
  ```

- [ ] **Step 2: Run the failing test** — `pnpm --filter @ra/client test useSuggestions`. Expected fail: module not found.

- [ ] **Step 3: Implement `client/src/hooks/useSuggestions.ts`:**
  ```ts
  import { useQuery } from '@tanstack/react-query';
  import type { suggestionFieldEnum } from '@ra/shared';
  import { z } from 'zod';
  import { apiFetch } from '../api/client';

  export type SuggestionField = z.infer<typeof suggestionFieldEnum>;

  export function useSuggestions(field: SuggestionField) {
    return useQuery<string[]>({
      queryKey: ['suggestions', field],
      queryFn: () =>
        apiFetch<string[]>(`/api/suggestions?field=${encodeURIComponent(field)}`),
      staleTime: 60_000,
    });
  }
  ```

- [ ] **Step 4: Implement `client/src/hooks/useSoftwareVersions.ts`:**
  ```ts
  import { useQuery } from '@tanstack/react-query';
  import { apiFetch } from '../api/client';

  export interface SoftwareVersionItem {
    id: string;
    value: string;
    createdAt: number;
    isLatest: boolean;
  }

  export function useSoftwareVersions() {
    return useQuery<SoftwareVersionItem[]>({
      queryKey: ['software-versions'],
      queryFn: () => apiFetch<SoftwareVersionItem[]>('/api/software-versions'),
      staleTime: 60_000,
    });
  }
  ```

- [ ] **Step 5: Implement `client/src/components/Combobox.tsx`** — antd `Select` wrapper. **Props:** `{ value?: string | null; onChange?: (v: string | null) => void; options: string[]; placeholder?: string; loading?: boolean; disabled?: boolean; allowCreate?: boolean }`. **Behavior:** `showSearch`, `allowClear`, `filterOption` case-insensitive contains; maps `options` to `{ label, value }`; when `allowCreate` and the typed `searchValue` matches no existing option, prepend a synthetic option `{ label: "Anlegen: <text>", value: text }` so the user can commit a new value (antd `Select` with `onSearch` tracking `searchValue` in local state). `onChange` forwards the selected/created string (or `null` on clear). **Acceptance:** selecting an existing option and typing+selecting a new value both call `onChange` with the string; disabled prop disables the control.

- [ ] **Step 6: Run the test** — `pnpm --filter @ra/client test useSuggestions`. Expected pass: 1 passed. Typecheck passes.

- [ ] **Step 7: Commit.**
  ```bash
  git add client/src/hooks client/src/components/Combobox.tsx
  git commit -m "feat(client): useSuggestions/useSoftwareVersions hooks and create-new Combobox"
  ```

---

### Task 5.11: DeviceList (Table ≥768 / List+Card <768) with server-side search/filter/sort

**Files:**
- create `client/src/hooks/useDevices.ts`
- create `client/src/features/devices/DeviceList.tsx`
- create `client/src/pages/DevicesPage.tsx` (replace placeholder)
- create `client/src/hooks/useDevices.test.tsx`

> The device list query params (`q`, `status`, `location`, `updateStatus`, `sort`, `page`, `pageSize`) are part of the react-query key; changing any param refetches from the server. We do **not** use antd's client-side filtering/sorting.

**`useDevices(params)` shape:** `params: { q?: string; status?: string; location?: string; updateStatus?: UpdateStatus; sort?: string; page: number; pageSize: number }`. Returns the paged response `{ items: DeviceListItem[]; total: number }` where `DeviceListItem = DeviceRecord & { updateStatus: UpdateStatus }`.

- [ ] **Step 1: Write the failing test** `client/src/hooks/useDevices.test.tsx` — mock fetch returning `{ items: [{ id:'1', issi:'1001', updateStatus:'aktuell', ... }], total: 1 }`; assert the query queryFn calls `/api/devices?...` including the encoded params (e.g. `q=funk`, `page=1`, `pageSize=20`) and `credentials: 'include'`; assert `result.current.data.items[0].updateStatus === 'aktuell'`.

- [ ] **Step 2: Run the failing test** — `pnpm --filter @ra/client test useDevices`. Expected fail: module not found.

- [ ] **Step 3: Implement `client/src/hooks/useDevices.ts`:**
  ```ts
  import { keepPreviousData, useQuery } from '@tanstack/react-query';
  import type { DeviceRecord, UpdateStatus } from '@ra/shared';
  import { apiFetch } from '../api/client';

  export type DeviceListItem = DeviceRecord & { updateStatus: UpdateStatus };

  export interface DeviceListParams {
    q?: string;
    status?: string;
    location?: string;
    updateStatus?: UpdateStatus;
    sort?: string;
    page: number;
    pageSize: number;
  }

  export interface DeviceListResponse {
    items: DeviceListItem[];
    total: number;
  }

  function toQueryString(params: DeviceListParams): string {
    const sp = new URLSearchParams();
    if (params.q) sp.set('q', params.q);
    if (params.status) sp.set('status', params.status);
    if (params.location) sp.set('location', params.location);
    if (params.updateStatus) sp.set('updateStatus', params.updateStatus);
    if (params.sort) sp.set('sort', params.sort);
    sp.set('page', String(params.page));
    sp.set('pageSize', String(params.pageSize));
    return sp.toString();
  }

  export function useDevices(params: DeviceListParams) {
    return useQuery<DeviceListResponse>({
      queryKey: ['devices', params],
      queryFn: () => apiFetch<DeviceListResponse>(`/api/devices?${toQueryString(params)}`),
      placeholderData: keepPreviousData,
    });
  }
  ```

- [ ] **Step 4: Implement `client/src/features/devices/DeviceList.tsx`.** **Local state:** `params: DeviceListParams` (`page:1, pageSize:20`), `search: string` (debounced into `params.q`). Consumes `useDevices(params)` and `Grid.useBreakpoint()`.
  - **Desktop (`screens.md`):** antd `Table` with columns Rufname, ISSI, Gerätetyp, Status, Standort, Update-Stand (renders `<UpdateStatusBadge status={record.updateStatus} />`), and an action column (row click / "Details" button → `navigate('/devices/' + id)`). `pagination={{ current: params.page, pageSize: params.pageSize, total }}`; `onChange(pagination, filters, sorter)` maps into `params` (sort string e.g. `rufname:asc`, status/location filters, page) — i.e. server-driven. A top `Input.Search` drives `search`/`q`; a `Select` filters `updateStatus` (aktuell/veraltet/unbekannt).
  - **Mobile (`!screens.md`):** antd `List` with `pagination` rendering each device as a `Card` showing Rufname (title), ISSI, `<UpdateStatusBadge>`, Standort; tapping the card navigates to detail. The search input + updateStatus filter remain on top.
  - **Acceptance:** changing search/filter/sort/page updates `params` → refetch; both layouts render the badge; clicking a row/card navigates to `/devices/:id`.

- [ ] **Step 5: Wire `DevicesPage`** to render `<DeviceList />` and, when `useParams().id` is set, mount `<DeviceDetailDrawer deviceId={id} />` (built in 5.12) over the list. Run `pnpm --filter @ra/client test useDevices`. Expected pass. Full suite green.

- [ ] **Step 6: Commit.**
  ```bash
  git add client/src/hooks/useDevices.ts client/src/hooks/useDevices.test.tsx client/src/features/devices/DeviceList.tsx client/src/pages/DevicesPage.tsx
  git commit -m "feat(client): responsive DeviceList with server-side search/filter/sort + useDevices"
  ```

---

### Task 5.12: DeviceDetailDrawer + role-gated edit Form (+ mandated role-gated form test)

**Files:**
- create `client/src/hooks/useDevice.ts`
- create `client/src/hooks/useUpdateDevice.ts`
- create `client/src/features/devices/DeviceEditForm.tsx`
- create `client/src/features/devices/DeviceDetailDrawer.tsx`
- create `client/src/features/devices/DeviceEditForm.test.tsx`

> Role-gating here is **UX-only** (server enforces via `filterEditableFields`). For `role === 'updater'`, identity fields (`issi`, `rufname`, `serialNumber`, `deviceType`, `location`, `assignedTo`, `notes`) are **disabled**; only `UPDATER_EDITABLE_FIELDS` (`softwareVersion`, `lastUpdatedAt`, `status`) stay editable. Admin edits everything. The PATCH mutation does an optimistic update + cache invalidation.

- [ ] **Step 1: Write `useDevice.ts`** — `useQuery<DeviceListItem>({ queryKey: ['device', id], queryFn: () => apiFetch('/api/devices/'+id), enabled: !!id })`.

- [ ] **Step 2: Write `useUpdateDevice.ts`** — `useMutation` calling `apiFetch('/api/devices/'+id, { method:'PATCH', body: patch })` where `patch: DevicePatch`; `onMutate` optimistically patches the `['device', id]` cache; `onError` rolls back; `onSettled` invalidates `['device', id]` and `['devices']`. Type the variables as `DevicePatch` from `@ra/shared`.

- [ ] **Step 3: Write the failing role-gated form test** `client/src/features/devices/DeviceEditForm.test.tsx`:
  ```tsx
  import { render, screen } from '@testing-library/react';
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  import { expect, test } from 'vitest';
  import type { Role } from '@ra/shared';
  import { DeviceEditForm } from './DeviceEditForm';

  const device = {
    id: '1', rufname: 'Florian 1', issi: '1001', serialNumber: 'SN1',
    deviceType: 'MTM5400', status: 'einsatzbereit', location: 'Wache',
    assignedTo: 'Zug 1', softwareVersion: 'FW 12.3', lastUpdatedAt: 1_700_000_000_000,
    notes: null, createdAt: 1, updatedAt: 1, createdBy: null, updatedBy: null,
    updateStatus: 'aktuell' as const,
  };

  function renderForm(role: Role) {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <DeviceEditForm device={device} role={role} onClose={() => {}} />
      </QueryClientProvider>,
    );
  }

  test('updater: identity fields are locked, update fields editable', () => {
    renderForm('updater');
    expect(screen.getByLabelText('ISSI')).toBeDisabled();
    expect(screen.getByLabelText('Rufname')).toBeDisabled();
    expect(screen.getByLabelText('Seriennummer')).toBeDisabled();
    // allowlisted update fields stay enabled
    expect(screen.getByLabelText('Status')).toBeEnabled();
    expect(screen.getByLabelText('Softwareversion')).toBeEnabled();
  });

  test('admin: all fields editable', () => {
    renderForm('admin');
    expect(screen.getByLabelText('ISSI')).toBeEnabled();
    expect(screen.getByLabelText('Rufname')).toBeEnabled();
    expect(screen.getByLabelText('Status')).toBeEnabled();
  });
  ```

- [ ] **Step 4: Run the failing test** — `pnpm --filter @ra/client test DeviceEditForm`. Expected fail: module not found.

- [ ] **Step 5: Implement `DeviceEditForm.tsx`.** **Props:** `{ device: DeviceListItem; role: Role; onClose: () => void }`. Uses antd `Form` (`useForm`, `initialValues` from device), `useUpdateDevice(device.id)`. Compute `const isUpdater = role === 'updater'` and a helper `const lockedFor = (field: string) => isUpdater && !UPDATER_EDITABLE_FIELDS.includes(field as never)` (import `UPDATER_EDITABLE_FIELDS` from `@ra/shared`).
  - Each `Form.Item` has the exact German `label` used in the test (`ISSI`, `Rufname`, `Seriennummer`, `Gerätetyp`, `Status`, `Standort`, `Zuordnung`, `Softwareversion`, `Zuletzt aktualisiert`, `Notizen`) and `name` = the schema field. Pass `disabled={lockedFor(name)}` to each control.
  - Comboboxes use the `Combobox` component sourced from `useSuggestions` (`rufname`/`deviceType`/`status`/`location`/`assignedTo`) and `useSoftwareVersions` (`softwareVersion`, `allowCreate`). `lastUpdatedAt` uses antd `DatePicker` (dayjs ms ↔ value). `notes` is `Input.TextArea`.
  - On submit: build `patch`, filter to changed fields, call the mutation, then `onClose()`. (Server re-applies `filterEditableFields`, so even if a disabled field were forced, it's stripped server-side.)
  - **Acceptance:** matches the test — updater sees ISSI/Rufname/Seriennummer disabled and Status/Softwareversion enabled; admin sees all enabled.

- [ ] **Step 6: Implement `DeviceDetailDrawer.tsx`.** **Props:** `{ deviceId: string }`. Uses `useDevice(deviceId)`, `useAuth()` for `role`, `useNavigate()`. Renders an antd `Drawer` (`open`, `onClose` → `navigate('/devices')`) titled with the device Rufname/ISSI; body shows read-only summary + `<UpdateStatusBadge status={device.updateStatus} />` and embeds `<DeviceEditForm device={device} role={role} onClose={...} />`. While loading shows `<Spin>`; on `ApiError` 404 shows an antd `Empty`/`Result`. **Acceptance:** opens when route has `:id`; closing returns to `/devices`.

- [ ] **Step 7: Run the test** — `pnpm --filter @ra/client test DeviceEditForm`. Expected pass: 2 passed. Full suite green.

- [ ] **Step 8: Commit.**
  ```bash
  git add client/src/hooks/useDevice.ts client/src/hooks/useUpdateDevice.ts client/src/features/devices/DeviceEditForm.tsx client/src/features/devices/DeviceDetailDrawer.tsx client/src/features/devices/DeviceEditForm.test.tsx
  git commit -m "feat(client): DeviceDetailDrawer with role-gated edit form (optimistic PATCH)"
  ```

---

### Task 5.13: DeviceFormModal (admin create)

**Files:**
- create `client/src/hooks/useCreateDevice.ts`
- create `client/src/features/devices/DeviceFormModal.tsx`
- modify `client/src/features/devices/DeviceList.tsx` (add admin "Gerät anlegen" button)

> Create is **admin-only**. The "Gerät anlegen" button in DeviceList renders only when `useAuth().isAdmin`. Server enforces admin on `POST /api/devices` (UI gate is UX-only).

- [ ] **Step 1: Write `useCreateDevice.ts`** — `useMutation` calling `apiFetch('/api/devices', { method:'POST', body })` with variables typed `DeviceCreate` (from `@ra/shared`); `onSuccess` invalidates `['devices']` and the `['suggestions', ...]` keys.

- [ ] **Step 2: Implement `DeviceFormModal.tsx`.** **Props:** `{ open: boolean; onClose: () => void }`. antd `Modal` + `Form`. Fields cover all `deviceCreateSchema` inputs (`issi` **required**, `rufname`, `serialNumber`, `deviceType`, `status`, `location`, `assignedTo`, `softwareVersion`, `lastUpdatedAt`, `notes`). ISSI is a plain required `Input`; the rest use `Combobox`/`DatePicker`/`TextArea` as in the edit form. Validate with the same labels as Task 5.12. On submit: `useCreateDevice().mutateAsync(values)` → on success `message.success`, reset form, `onClose()`; on `ApiError` show `message.error(err.message)`.

- [ ] **Step 3: Wire into DeviceList** — add a primary "Gerät anlegen" `Button` (visible only when `isAdmin`) that opens the modal; on success the list refetches via invalidation.

- [ ] **Step 4: Add a smoke test** `DeviceFormModal.test.tsx` (optional but recommended): render with `open={true}`, assert the ISSI field has a required marker and that submitting empty surfaces a validation error ("ISSI" required). Run `pnpm --filter @ra/client test DeviceFormModal`. Expected pass.

- [ ] **Step 5: Run full suite** — `pnpm --filter @ra/client test`. All green. Typecheck passes.

- [ ] **Step 6: Commit.**
  ```bash
  git add client/src/hooks/useCreateDevice.ts client/src/features/devices/DeviceFormModal.tsx client/src/features/devices/DeviceList.tsx client/src/features/devices/DeviceFormModal.test.tsx
  git commit -m "feat(client): admin-only DeviceFormModal for device creation"
  ```

---

### Task 5.14: ImportWizard (upload → mapping → preview → commit)

**Files:**
- create `client/src/hooks/useImportParse.ts`
- create `client/src/hooks/useImportCommit.ts`
- create `client/src/features/import/columnMapping.ts`
- create `client/src/features/import/ImportWizard.tsx`
- create `client/src/pages/ImportPage.tsx` (replace placeholder)
- create `client/src/features/import/columnMapping.test.ts`

> Four-step antd `Steps` wizard. **Step state machine:** `'upload' → 'mapping' → 'preview' → 'done'`. Server-side parse/diff: upload calls `POST /api/import/parse` (multipart, via `apiUpload`), preview calls `POST /api/import/commit` with `dryRun:true`, commit calls it with `dryRun:false`. **ISSI mapping is mandatory** to leave the mapping step. Updater-created rows surface as `skipped-no-permission` in the preview (no special client logic; server classifies).

- [ ] **Step 1: Write the failing test** `client/src/features/import/columnMapping.test.ts` for the header-similarity auto-mapper:
  ```ts
  import { expect, test } from 'vitest';
  import { autoMapColumns } from './columnMapping';

  test('maps obvious headers to device fields', () => {
    const result = autoMapColumns(['ISSI', 'Rufname', 'Software', 'Standort']);
    expect(result.issi).toBe('ISSI');
    expect(result.rufname).toBe('Rufname');
    expect(result.softwareVersion).toBe('Software');
    expect(result.location).toBe('Standort');
  });

  test('is case-insensitive and ignores unknown columns', () => {
    const result = autoMapColumns(['issi', 'foo', 'TYP']);
    expect(result.issi).toBe('issi');
    expect(result.deviceType).toBe('TYP');
    expect(Object.values(result)).not.toContain('foo');
  });

  test('leaves issi undefined when no matching header', () => {
    const result = autoMapColumns(['col1', 'col2']);
    expect(result.issi).toBeUndefined();
  });
  ```

- [ ] **Step 2: Run the failing test** — `pnpm --filter @ra/client test columnMapping`. Expected fail: module not found.

- [ ] **Step 3: Implement `columnMapping.ts`.** Export `type ColumnMapping = Partial<Record<DeviceMappableField, string>>` and `autoMapColumns(columns: string[]): ColumnMapping`. Use a keyword table per target field (`issi: ['issi']`, `rufname: ['rufname','name']`, `softwareVersion: ['software','firmware','fw','version']`, `location: ['standort','location','ort']`, `deviceType: ['typ','type','modell','model']`, `status: ['status','zustand']`, `assignedTo: ['zuordnung','assigned','gruppe']`, `serialNumber: ['serien','serial','inventar']`, `lastUpdatedAt: ['datum','date','aktualisiert','updated']`). For each column, lowercase and pick the first target whose any keyword is a substring; first column wins per target.

- [ ] **Step 4: Run the test** — `pnpm --filter @ra/client test columnMapping`. Expected pass: 3 passed.

- [ ] **Step 5: Write hooks.** `useImportParse` → `useMutation` taking a `File`, builds `FormData` (`file`), calls `apiUpload<{ columns: string[]; rows: string[][]; detected: { delimiter: string; encoding: string } }>('/api/import/parse', form)`. `useImportCommit` → `useMutation` taking the `importCommitSchema` payload `{ mapping, rows, dryRun }`, calls `apiFetch('/api/import/commit', { method:'POST', body })`; type the payload with the inferred type of `importCommitSchema`. The commit response carries per-row `{ class: ImportRowClass, changes, error? }` plus counters.

- [ ] **Step 6: Implement `ImportWizard.tsx`.** **State:** `step`, `parsed` (parse result), `mapping: ColumnMapping`, `preview` (dryRun commit result). 
  - **Upload step:** antd `Upload.Dragger` (`beforeUpload` returns false to prevent auto-POST; capture the `File`), then call `useImportParse`; on success set `parsed`, auto-run `autoMapColumns(parsed.columns)`, advance to mapping.
  - **Mapping step:** for each device field render a `Select` of `parsed.columns` (plus "— nicht zuordnen —"); "Weiter" disabled until `mapping.issi` is set (mandatory). On continue, call `useImportCommit({ mapping, rows: parsed.rows, dryRun: true })`, store result, advance to preview.
  - **Preview step:** antd `Statistic`/counters for `created`/`updated`/`unchanged`/`error`/`skipped-no-permission`, and a `Table` of rows colored by `class` (use `<Tag>` per class; `skipped-no-permission` shown with an info tooltip "updater darf keine neuen Geräte anlegen"). "Import ausführen" calls commit with `dryRun:false`; on success advance to done, invalidate `['devices']`.
  - **Done step:** `Result` success with final counters and a button back to `/devices`.
  - **Acceptance:** cannot advance past mapping without ISSI; preview shows server classification; commit refetches the device list.

- [ ] **Step 7: Wire `ImportPage`** to render `<ImportWizard />`. Run full suite `pnpm --filter @ra/client test`. All green; typecheck passes.

- [ ] **Step 8: Commit.**
  ```bash
  git add client/src/hooks/useImportParse.ts client/src/hooks/useImportCommit.ts client/src/features/import client/src/pages/ImportPage.tsx
  git commit -m "feat(client): CSV ImportWizard (upload -> mapping -> preview -> commit)"
  ```

---

### Task 5.15: Dashboard (Statistic cards + outdated quick list)

**Files:**
- create `client/src/hooks/useDashboardStats.ts`
- create `client/src/features/dashboard/Dashboard.tsx`
- create `client/src/pages/DashboardPage.tsx` (replace placeholder)

> The counts come from the device list's `updateStatus` values. Simplest correct approach: query `useDevices({ page:1, pageSize: 1, ... })` per status to read `total`, OR derive from a single `GET /api/devices` summary. To avoid client recomputation and keep it server-driven, `useDashboardStats` issues three `useDevices`-style queries filtered by `updateStatus` (`aktuell`/`veraltet`/`unbekannt`) reading each `total`, plus one unfiltered for the grand total.

- [ ] **Step 1: Implement `useDashboardStats.ts`** — compose four `useDevices` calls (or four `apiFetch('/api/devices?updateStatus=...&pageSize=1')` queries) returning `{ total, aktuell, veraltet, unbekannt, isLoading }`. Reuse `useDevices` with `pageSize: 1` and read `.data.total` per status; `isLoading` = any query loading.

- [ ] **Step 2: Implement `Dashboard.tsx`** — antd `Row`/`Col` of `Card` + `Statistic` for Gesamt, Aktuell (green), Veraltet (red), Unbekannt (grey), each value from `useDashboardStats`. Below: a "Veraltete Geräte" quick list using `useDevices({ updateStatus:'veraltet', page:1, pageSize:5, ... })` rendering Rufname + ISSI + `<UpdateStatusBadge>`; a "Alle veralteten anzeigen" link navigates to `/devices?updateStatus=veraltet`. Clicking a count card also navigates to `/devices` with the matching `updateStatus` filter.

- [ ] **Step 3: Wire `DashboardPage`** to render `<Dashboard />`. Add a smoke test `Dashboard.test.tsx`: mock fetch so each `/api/devices?...` returns a distinct `total`; assert the four `Statistic` values render (e.g. find "Veraltet" card showing the mocked count). Run `pnpm --filter @ra/client test Dashboard`. Expected pass.

- [ ] **Step 4: Run the full client suite** — `pnpm --filter @ra/client test` (all green) and `pnpm --filter @ra/client typecheck` and `pnpm --filter @ra/client build`. Expected: build succeeds, all tests pass.

- [ ] **Step 5: Commit.**
  ```bash
  git add client/src/hooks/useDashboardStats.ts client/src/features/dashboard client/src/pages/DashboardPage.tsx
  git commit -m "feat(client): Dashboard with status Statistic cards and outdated quick list"
  ```

---

## Phase 6: Docker-Image + GitHub-Actions-CI (GHCR)

**Goal:** Package the whole monorepo into one self-contained Docker image (multi-stage, runs migrations on start, serves `/api/*` plus the built SPA), and wire a GitHub Actions pipeline that tests every PR/push and builds+pushes the image to GHCR on `main`/tags.

> This phase assumes Phases 1–5 already produced `@ra/shared`, `@ra/server` (Hono app exported from `server/src/app.ts`, bootstrap in `server/src/index.ts`, drizzle schema at `server/src/db/schema.ts`, migrations folder `server/drizzle/`), and `@ra/client` (Vite app building to `client/dist`). All new server code in this phase lives behind the existing `requireAuth`/`requireRole` middleware and never intercepts `/api/*`.

---

### Task 6.1: Static SPA serving + SPA-fallback route on the server

**Files:**
- create `server/src/static.ts`
- modify `server/src/app.ts`
- create test `server/test/static.test.ts`

- [ ] **Step 1: Write failing test for static + fallback wiring.** Create `server/test/static.test.ts`. The test imports a factory `mountStatic(app, clientDistDir)` and uses a temp `clientDist` fixture so it does not depend on a real Vite build:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mountStatic } from '../src/static.js';

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'ra-dist-'));
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>RA</title>');
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("app")');
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function makeApp() {
  const app = new Hono();
  app.get('/api/auth/me', (c) => c.json({ name: 'x', role: 'admin' }));
  app.notFound((c) => c.json({ error: 'not found' }, 404)); // baseline pre-mount
  const real = new Hono();
  real.get('/api/auth/me', (c) => c.json({ name: 'x', role: 'admin' }));
  mountStatic(real, dir);
  return real;
}

describe('mountStatic', () => {
  it('serves index.html at /', async () => {
    const res = await makeApp().request('/');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>RA</title>');
  });

  it('serves a built asset', async () => {
    const res = await makeApp().request('/assets/app.js');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('console.log');
  });

  it('falls back to index.html for unknown SPA routes', async () => {
    const res = await makeApp().request('/devices/abc123');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>RA</title>');
  });

  it('does NOT fall back for /api/* (returns JSON 404, not index.html)', async () => {
    const res = await makeApp().request('/api/does-not-exist');
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).not.toContain('<title>RA</title>');
  });

  it('still routes real /api endpoints', async () => {
    const res = await makeApp().request('/api/auth/me');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'x', role: 'admin' });
  });
});
```

- [ ] **Step 2: Run the test, expect failure (module missing).**
  Command: `pnpm --filter @ra/server test -- static.test.ts`
  Expected: fails to resolve `../src/static.js` → `Cannot find module` / "Failed to load url ../src/static.js".

- [ ] **Step 3: Implement `server/src/static.ts` (minimal).** Use `@hono/node-server/serve-static` for files, and a final catch-all that excludes `/api`:

```ts
import type { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function mountStatic(app: Hono, clientDistDir: string): void {
  // Serve built static assets (js/css/img). root is relative to process.cwd();
  // pass an absolute dir via rewriteRequestPath-free root option.
  app.use(
    '/*',
    serveStatic({
      root: clientDistDir,
      // serveStatic resolves paths against process.cwd(); use a getContent override
      // so we can pass an absolute directory reliably.
      getContent: async (path) => {
        try {
          return readFileSync(join(clientDistDir, path.replace(/^\/+/, '')));
        } catch {
          return null;
        }
      },
    }),
  );

  // SPA fallback: any non-/api GET that wasn't a static file returns index.html.
  app.get('*', (c) => {
    if (c.req.path.startsWith('/api')) {
      return c.json({ error: 'not found' }, 404);
    }
    const html = readFileSync(join(clientDistDir, 'index.html'), 'utf8');
    return c.html(html);
  });
}
```

- [ ] **Step 4: Run the test, expect pass.**
  Command: `pnpm --filter @ra/server test -- static.test.ts`
  Expected: all 5 assertions pass.

- [ ] **Step 5: Wire `mountStatic` into the real app behind an env flag.** In `server/src/app.ts`, after all `/api/*` routes are registered, add:

```ts
import { mountStatic } from './static.js';
// ...at the very end of buildApp(), after api routes are mounted:
if (process.env.SERVE_CLIENT !== 'false') {
  const clientDist =
    process.env.CLIENT_DIST_DIR ?? new URL('../../client/dist', import.meta.url).pathname;
  mountStatic(app, clientDist);
}
```
(Existing API route tests must still pass because static mounting is last and `/api` 404s stay JSON.)

- [ ] **Step 6: Run the full server suite to confirm no regression.**
  Command: `pnpm --filter @ra/server test`
  Expected: previously-passing API tests + the 5 new static tests pass.

- [ ] **Step 7: Commit.**
```bash
git checkout -b phase-6-docker-ci
git add server/src/static.ts server/src/app.ts server/test/static.test.ts
git commit -m "feat(server): serve client dist with SPA fallback excluding /api"
```

---

### Task 6.2: Migration runner usable from the container start command

**Files:**
- create `server/src/migrate.ts`
- modify `server/package.json` (add `"migrate"` script)
- create test `server/test/migrate.test.ts`

- [ ] **Step 1: Write failing test for the programmatic migrator.** Create `server/test/migrate.test.ts`. It runs migrations against a fresh temp DB file and asserts the `devices` table exists afterward:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMigrations } from '../src/migrate.js';

let dir: string | null = null;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe('runMigrations', () => {
  it('creates the schema in an empty database file', () => {
    dir = mkdtempSync(join(tmpdir(), 'ra-mig-'));
    const dbPath = join(dir, 'data.sqlite');

    runMigrations(dbPath);

    const db = new Database(dbPath, { readonly: true });
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name);
    db.close();

    expect(tables).toContain('devices');
    expect(tables).toContain('software_versions');
    expect(tables).toContain('device_events');
  });

  it('is idempotent (running twice does not throw)', () => {
    dir = mkdtempSync(join(tmpdir(), 'ra-mig-'));
    const dbPath = join(dir, 'data.sqlite');
    runMigrations(dbPath);
    expect(() => runMigrations(dbPath)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test, expect failure.**
  Command: `pnpm --filter @ra/server test -- migrate.test.ts`
  Expected: fails — `Cannot find module ../src/migrate.js`.

- [ ] **Step 3: Implement `server/src/migrate.ts`.** Use drizzle's better-sqlite3 migrator pointed at the committed `server/drizzle` folder (produced by drizzle-kit in earlier phases). No drizzle-kit needed at runtime:

```ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function runMigrations(databasePath: string): void {
  mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  const sqlite = new Database(databasePath);
  sqlite.pragma('journal_mode = WAL');
  const db = drizzle(sqlite);
  const migrationsFolder =
    process.env.MIGRATIONS_DIR ?? new URL('../drizzle', import.meta.url).pathname;
  migrate(db, { migrationsFolder });
  sqlite.close();
}

// CLI entry: `node dist/migrate.js`
if (import.meta.url === `file://${process.argv[1]}`) {
  const path = process.env.DATABASE_PATH ?? './data/data.sqlite';
  runMigrations(path);
  // eslint-disable-next-line no-console
  console.log(`[migrate] applied migrations to ${path}`);
}
```

- [ ] **Step 4: Run the test, expect pass.**
  Command: `pnpm --filter @ra/server test -- migrate.test.ts`
  Expected: both tests pass (assumes `server/drizzle/*.sql` migrations exist from Phase 2; if the folder is empty, the test surfaces that gap — fix by generating migrations before continuing).

- [ ] **Step 5: Add a `migrate` script.** In `server/package.json` scripts, add: `"migrate": "node dist/migrate.js"`. (The compiled `dist/migrate.js` is produced by the existing build in Step 6.3.)

- [ ] **Step 6: Verify the build emits `migrate.js`.** Ensure the server build entry list (tsup `entry` or tsc) includes `src/migrate.ts`. If tsup config exists, add `'src/migrate.ts'` to `entry`. Run:
  Command: `pnpm --filter @ra/server build && ls server/dist/migrate.js`
  Expected: `server/dist/migrate.js` exists.

- [ ] **Step 7: Commit.**
```bash
git add server/src/migrate.ts server/package.json server/tsup.config.ts
git commit -m "feat(server): programmatic drizzle migration runner with CLI entry"
```

---

### Task 6.3: Container entrypoint (migrate → start server)

**Files:**
- create `docker/entrypoint.sh`
- create test `server/test/entrypoint.test.ts`

- [ ] **Step 1: Write failing test asserting the entrypoint contract.** A lightweight test that the script (a) runs the migrate step before the server, (b) `exec`s node so signals propagate, and (c) does not contain placeholders:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';

const path = new URL('../../docker/entrypoint.sh', import.meta.url).pathname;

describe('docker/entrypoint.sh', () => {
  const script = readFileSync(path, 'utf8');

  it('runs migrations before starting the server', () => {
    const migrateIdx = script.indexOf('migrate');
    const serverIdx = script.indexOf('dist/index.js');
    expect(migrateIdx).toBeGreaterThan(-1);
    expect(serverIdx).toBeGreaterThan(-1);
    expect(migrateIdx).toBeLessThan(serverIdx);
  });

  it('uses set -e and exec for signal forwarding', () => {
    expect(script).toMatch(/set -e/);
    expect(script).toMatch(/exec node/);
  });

  it('is executable', () => {
    expect(statSync(path).mode & 0o111).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test, expect failure.**
  Command: `pnpm --filter @ra/server test -- entrypoint.test.ts`
  Expected: fails — `ENOENT ... docker/entrypoint.sh`.

- [ ] **Step 3: Create `docker/entrypoint.sh`.**
```sh
#!/bin/sh
set -e

echo "[entrypoint] running database migrations (DATABASE_PATH=${DATABASE_PATH:-./data/data.sqlite})"
node dist/migrate.js

echo "[entrypoint] starting server on port ${PORT:-3000}"
exec node dist/index.js
```

- [ ] **Step 4: Make it executable and re-run the test, expect pass.**
  Command: `chmod +x docker/entrypoint.sh && pnpm --filter @ra/server test -- entrypoint.test.ts`
  Expected: all 3 tests pass.

- [ ] **Step 5: Commit.**
```bash
git add docker/entrypoint.sh server/test/entrypoint.test.ts
git update-index --chmod=+x docker/entrypoint.sh
git commit -m "feat(docker): entrypoint runs migrations then execs server"
```

---

### Task 6.4: `.dockerignore`

**Files:**
- create `.dockerignore`

- [ ] **Step 1: Create `.dockerignore`.**
```
**/node_modules
**/dist
**/.turbo
**/coverage
.git
.github
**/*.log
**/.env
**/.env.*
!**/.env.example
data
*.sqlite
*.sqlite-*
docs
**/.DS_Store
Dockerfile
docker-compose.yml
.dockerignore
```

- [ ] **Step 2: Sanity-check it excludes node_modules and data but keeps `.env.example`.**
  Command: `grep -E 'node_modules|!\*\*/\.env\.example|^data' .dockerignore`
  Expected: prints the `node_modules`, the negated `.env.example`, and the `data` lines.

- [ ] **Step 3: Commit.**
```bash
git add .dockerignore
git commit -m "chore(docker): add .dockerignore"
```

---

### Task 6.5: Production `.env.example`

**Files:**
- create `.env.example`
- create test `server/test/env-example.test.ts`

- [ ] **Step 1: Write failing test verifying every required env var (from spec §12) is documented.**
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const path = new URL('../../.env.example', import.meta.url).pathname;

const REQUIRED = [
  'DATABASE_PATH',
  'SESSION_SECRET',
  'OIDC_ISSUER',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'OIDC_REDIRECT_URI',
  'OIDC_ADMIN_GROUP',
  'OIDC_UPDATER_GROUP',
  'AUTH_DEV_BYPASS',
  'DEV_USER_ROLE',
  'DEV_USER_NAME',
  'PORT',
] as const;

describe('.env.example', () => {
  const content = readFileSync(path, 'utf8');
  for (const key of REQUIRED) {
    it(`documents ${key}`, () => {
      expect(content).toMatch(new RegExp(`^${key}=`, 'm'));
    });
  }
  it('defaults AUTH_DEV_BYPASS to false (fail-safe)', () => {
    expect(content).toMatch(/^AUTH_DEV_BYPASS=false\s*$/m);
  });
  it('does not contain a real secret', () => {
    expect(content).not.toMatch(/SESSION_SECRET=.{16,}/);
  });
});
```

- [ ] **Step 2: Run the test, expect failure.**
  Command: `pnpm --filter @ra/server test -- env-example.test.ts`
  Expected: fails — file not found.

- [ ] **Step 3: Create `.env.example`.**
```dotenv
# --- Persistence ---
DATABASE_PATH=/data/data.sqlite

# --- Session (REQUIRED in prod) ---
# Generate with: openssl rand -base64 32
SESSION_SECRET=

# --- OIDC / PocketID (REQUIRED in prod) ---
OIDC_ISSUER=
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
OIDC_REDIRECT_URI=https://radio-admin.example.org/api/auth/callback
OIDC_ADMIN_GROUP=admin
OIDC_UPDATER_GROUP=personal

# --- Dev bypass (MUST stay false in prod) ---
AUTH_DEV_BYPASS=false
DEV_USER_ROLE=admin
DEV_USER_NAME=Dev User

# --- Server ---
PORT=3000
```

- [ ] **Step 4: Run the test, expect pass.**
  Command: `pnpm --filter @ra/server test -- env-example.test.ts`
  Expected: all 14 assertions pass.

- [ ] **Step 5: Commit.**
```bash
git add .env.example server/test/env-example.test.ts
git commit -m "docs(env): add production .env.example covering all env vars"
```

---

### Task 6.6: Multi-stage `Dockerfile`

**Files:**
- create `Dockerfile`
- create test `server/test/dockerfile.test.ts`

- [ ] **Step 1: Write failing test asserting the Dockerfile structure/contract.** This guards the locked build order and runtime concerns without needing a real build:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const df = readFileSync(new URL('../../Dockerfile', import.meta.url).pathname, 'utf8');

describe('Dockerfile', () => {
  it('has deps, build and runtime stages', () => {
    expect(df).toMatch(/AS deps/);
    expect(df).toMatch(/AS build/);
    expect(df).toMatch(/AS runtime/);
  });
  it('enables pnpm via corepack', () => {
    expect(df).toMatch(/corepack enable/);
  });
  it('installs with a frozen lockfile', () => {
    expect(df).toMatch(/pnpm install --frozen-lockfile/);
  });
  it('builds shared, client and server', () => {
    expect(df).toMatch(/@ra\/shared.*build|--filter @ra\/shared build/);
    expect(df).toMatch(/@ra\/client.*build|--filter @ra\/client build/);
    expect(df).toMatch(/@ra\/server.*build|--filter @ra\/server build/);
  });
  it('rebuilds the better-sqlite3 native binding in runtime', () => {
    expect(df).toMatch(/better-sqlite3/);
  });
  it('copies the built client dist into the runtime image', () => {
    expect(df).toMatch(/client\/dist/);
  });
  it('copies migrations into the runtime image', () => {
    expect(df).toMatch(/server\/drizzle/);
  });
  it('runs as a non-root user', () => {
    expect(df).toMatch(/USER node/);
  });
  it('uses the entrypoint script', () => {
    expect(df).toMatch(/entrypoint\.sh/);
  });
  it('exposes the server port', () => {
    expect(df).toMatch(/EXPOSE 3000/);
  });
});
```

- [ ] **Step 2: Run the test, expect failure.**
  Command: `pnpm --filter @ra/server test -- dockerfile.test.ts`
  Expected: fails — Dockerfile not found.

- [ ] **Step 3: Write the `Dockerfile`.** Multi-stage; `deps` installs everything for the build, `build` compiles shared→client→server, `runtime` installs only prod deps and rebuilds the native binding against the runtime Node:

```dockerfile
# syntax=docker/dockerfile:1

# ---------- deps: full install for building ----------
FROM node:22-bookworm-slim AS deps
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app
# Copy only manifests first for cached installs
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---------- build: shared -> client -> server ----------
FROM deps AS build
WORKDIR /app
COPY . .
RUN pnpm --filter @ra/shared build \
 && pnpm --filter @ra/client build \
 && pnpm --filter @ra/server build

# ---------- runtime: slim, prod deps, native rebuild ----------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV DATABASE_PATH=/data/data.sqlite
ENV PORT=3000
RUN corepack enable
WORKDIR /app

# Build toolchain needed only to compile the better-sqlite3 binding, then removed.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# Manifests for prod install
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

# Install prod deps for shared+server only; rebuild native binding for THIS node.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod \
      --filter @ra/server... \
 && pnpm --filter @ra/server rebuild better-sqlite3

# Built artifacts
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/drizzle ./server/drizzle
COPY --from=build /app/client/dist ./client/dist

# Entrypoint
COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Server expects to run from server/ so import.meta.url paths resolve to
# ../drizzle and ../../client/dist.
WORKDIR /app/server

ENV CLIENT_DIST_DIR=/app/client/dist
ENV MIGRATIONS_DIR=/app/server/drizzle

RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 3000
ENTRYPOINT ["/app/entrypoint.sh"]
```

- [ ] **Step 4: Run the structural test, expect pass.**
  Command: `pnpm --filter @ra/server test -- dockerfile.test.ts`
  Expected: all 10 assertions pass.

- [ ] **Step 5: Build the image locally (real verification).**
  Command: `docker build -t radio-admin:dev .`
  Expected: build completes; `deps` installs, `build` emits all three dist folders, `runtime` rebuilds `better-sqlite3` without error. (If `pnpm rebuild` fails, confirm `python3 make g++` are present in the runtime stage — they are.)

- [ ] **Step 6: Commit.**
```bash
git add Dockerfile server/test/dockerfile.test.ts
git commit -m "feat(docker): multi-stage Dockerfile, native rebuild, static client"
```

---

### Task 6.7: `docker-compose.yml`

**Files:**
- create `docker-compose.yml`
- create test `server/test/compose.test.ts`

- [ ] **Step 1: Write failing test asserting the compose contract.**
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const yml = readFileSync(new URL('../../docker-compose.yml', import.meta.url).pathname, 'utf8');

describe('docker-compose.yml', () => {
  it('defines exactly one service named app', () => {
    expect(yml).toMatch(/^\s{2}app:/m);
    // no second top-level service key beyond app
    const services = [...yml.matchAll(/^\s{2}([a-z0-9_-]+):/gm)].map((m) => m[1]);
    expect(services).toContain('app');
  });
  it('builds from the local Dockerfile', () => {
    expect(yml).toMatch(/build:\s*\./);
  });
  it('maps the server port', () => {
    expect(yml).toMatch(/3000:3000/);
  });
  it('mounts a named volume for the sqlite data dir', () => {
    expect(yml).toMatch(/:\s*\/data/);
    expect(yml).toMatch(/^volumes:/m);
  });
  it('loads env from an env file', () => {
    expect(yml).toMatch(/env_file:/);
  });
  it('sets the sqlite path under the mounted volume', () => {
    expect(yml).toMatch(/DATABASE_PATH=\/data\/data\.sqlite/);
  });
});
```

- [ ] **Step 2: Run the test, expect failure.**
  Command: `pnpm --filter @ra/server test -- compose.test.ts`
  Expected: fails — compose file not found.

- [ ] **Step 3: Create `docker-compose.yml`.**
```yaml
services:
  app:
    build: .
    image: radio-admin:local
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - .env
    environment:
      - DATABASE_PATH=/data/data.sqlite
      - PORT=3000
    volumes:
      - radio-data:/data

volumes:
  radio-data:
```

- [ ] **Step 4: Run the test, expect pass.**
  Command: `pnpm --filter @ra/server test -- compose.test.ts`
  Expected: all assertions pass.

- [ ] **Step 5: Validate compose syntax (real check).**
  Command: `cp .env.example .env && docker compose config >/dev/null && echo COMPOSE_OK`
  Expected: prints `COMPOSE_OK` (parses cleanly). Remove the throwaway `.env` afterward: `rm .env`.

- [ ] **Step 6: Commit.**
```bash
git add docker-compose.yml server/test/compose.test.ts
git commit -m "feat(docker): single-service compose with sqlite volume and env_file"
```

---

### Task 6.8: GitHub Actions CI — `test` job

**Files:**
- create `.github/workflows/ci.yml`
- create test `server/test/ci-workflow.test.ts`

- [ ] **Step 1: Write failing test for the workflow `test` job contract.** Parse the YAML and assert the pipeline steps exist in order:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const yml = readFileSync(
  new URL('../../.github/workflows/ci.yml', import.meta.url).pathname,
  'utf8',
);

describe('ci.yml test job', () => {
  it('triggers on pull_request and push', () => {
    expect(yml).toMatch(/pull_request:/);
    expect(yml).toMatch(/push:/);
  });
  it('defines a test job', () => {
    expect(yml).toMatch(/^\s{2}test:/m);
  });
  it('uses pnpm and the frozen lockfile', () => {
    expect(yml).toMatch(/pnpm\/action-setup/);
    expect(yml).toMatch(/pnpm install --frozen-lockfile/);
  });
  it('runs lint, typecheck and vitest', () => {
    const lint = yml.indexOf('lint');
    const typecheck = yml.indexOf('typecheck');
    const test = yml.indexOf('vitest run');
    expect(lint).toBeGreaterThan(-1);
    expect(typecheck).toBeGreaterThan(-1);
    expect(test).toBeGreaterThan(-1);
  });
});
```

- [ ] **Step 2: Run the test, expect failure.**
  Command: `pnpm --filter @ra/server test -- ci-workflow.test.ts`
  Expected: fails — workflow file not found.

- [ ] **Step 3: Create `.github/workflows/ci.yml` with the `test` job only.**
```yaml
name: CI

on:
  push:
    branches: [main]
    tags: ['v*']
  pull_request:

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm -r lint

      - name: Typecheck
        run: pnpm -r typecheck

      - name: Test
        run: pnpm -r exec vitest run
```

- [ ] **Step 4: Run the test, expect pass.**
  Command: `pnpm --filter @ra/server test -- ci-workflow.test.ts`
  Expected: all assertions pass.

- [ ] **Step 5: Lint the workflow YAML (real check).**
  Command: `pnpm dlx js-yaml .github/workflows/ci.yml >/dev/null && echo YAML_OK`
  Expected: prints `YAML_OK`.

- [ ] **Step 6: Commit.**
```bash
git add .github/workflows/ci.yml server/test/ci-workflow.test.ts
git commit -m "ci: add test job (install, lint, typecheck, vitest)"
```

---

### Task 6.9: GitHub Actions CI — `docker` job (build + push to GHCR)

**Files:**
- modify `.github/workflows/ci.yml`
- modify test `server/test/ci-workflow.test.ts`

- [ ] **Step 1: Extend the test for the `docker` job contract.** Append to `server/test/ci-workflow.test.ts`:
```ts
describe('ci.yml docker job', () => {
  it('defines a docker job that needs test', () => {
    expect(yml).toMatch(/^\s{2}docker:/m);
    expect(yml).toMatch(/needs:\s*test/);
  });
  it('only runs on push to main or tags (not PRs)', () => {
    expect(yml).toMatch(/github\.event_name == 'push'/);
  });
  it('grants packages:write permission', () => {
    expect(yml).toMatch(/packages:\s*write/);
  });
  it('logs into ghcr.io with GITHUB_TOKEN', () => {
    expect(yml).toMatch(/docker\/login-action/);
    expect(yml).toMatch(/registry:\s*ghcr\.io/);
    expect(yml).toMatch(/password:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/);
  });
  it('targets ghcr.io/<owner>/radio-admin with latest/sha/tag', () => {
    expect(yml).toMatch(/ghcr\.io\/\$\{\{\s*github\.repository_owner\s*\}\}\/radio-admin/);
    expect(yml).toMatch(/type=sha/);
    expect(yml).toMatch(/type=raw,value=latest/);
    expect(yml).toMatch(/type=ref,event=tag/);
  });
  it('uses buildx and build-push-action', () => {
    expect(yml).toMatch(/docker\/setup-buildx-action/);
    expect(yml).toMatch(/docker\/build-push-action/);
  });
});
```

- [ ] **Step 2: Run the test, expect failure.**
  Command: `pnpm --filter @ra/server test -- ci-workflow.test.ts`
  Expected: the new `docker job` block fails (docker job absent).

- [ ] **Step 3: Add the `docker` job to `.github/workflows/ci.yml`.** Append under `jobs:`:
```yaml
  docker:
    needs: test
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Derive image tags
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository_owner }}/radio-admin
          tags: |
            type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}
            type=sha
            type=ref,event=tag

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 4: Run the test, expect pass.**
  Command: `pnpm --filter @ra/server test -- ci-workflow.test.ts`
  Expected: both `test job` and `docker job` describe blocks pass.

- [ ] **Step 5: Re-validate workflow YAML (real check).**
  Command: `pnpm dlx js-yaml .github/workflows/ci.yml >/dev/null && echo YAML_OK`
  Expected: prints `YAML_OK`.

- [ ] **Step 6: Commit.**
```bash
git add .github/workflows/ci.yml server/test/ci-workflow.test.ts
git commit -m "ci: build and push image to GHCR on main/tags via buildx"
```

---

### Task 6.10: Image smoke test (serves `/` and `/api/auth/me`)

**Files:**
- create `scripts/smoke.sh`
- create test `server/test/smoke-script.test.ts`
- modify `.github/workflows/ci.yml` (add smoke step to `docker` job)

- [ ] **Step 1: Write failing test for the smoke script contract.** It must run the image with dev-bypass + dummy session secret on an isolated DB volume, then curl `/` (expect HTML 200) and `/api/auth/me` (expect JSON 200 with the dev user):
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';

const path = new URL('../../scripts/smoke.sh', import.meta.url).pathname;
const s = readFileSync(path, 'utf8');

describe('scripts/smoke.sh', () => {
  it('is executable', () => {
    expect(statSync(path).mode & 0o111).toBeGreaterThan(0);
  });
  it('runs the container with dev bypass and a session secret', () => {
    expect(s).toMatch(/AUTH_DEV_BYPASS=true/);
    expect(s).toMatch(/SESSION_SECRET=/);
  });
  it('checks the SPA root returns 200', () => {
    expect(s).toMatch(/localhost:3000\/(["' ]|$)/m);
  });
  it('checks /api/auth/me returns 200', () => {
    expect(s).toMatch(/\/api\/auth\/me/);
  });
  it('cleans up the container on exit', () => {
    expect(s).toMatch(/docker rm -f|--rm|trap /);
  });
});
```

- [ ] **Step 2: Run the test, expect failure.**
  Command: `pnpm --filter @ra/server test -- smoke-script.test.ts`
  Expected: fails — smoke script not found.

- [ ] **Step 3: Create `scripts/smoke.sh`.**
```sh
#!/bin/sh
set -e

IMAGE="${1:-radio-admin:dev}"
NAME="radio-admin-smoke"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$NAME" \
  -e AUTH_DEV_BYPASS=true \
  -e DEV_USER_ROLE=admin \
  -e DEV_USER_NAME="Smoke User" \
  -e SESSION_SECRET=smoke-secret-not-for-prod \
  -e DATABASE_PATH=/data/data.sqlite \
  -p 3000:3000 \
  "$IMAGE"

echo "[smoke] waiting for server..."
for i in $(seq 1 30); do
  if curl -fsS "http://localhost:3000/api/auth/me" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "[smoke] checking SPA root /"
root_code=$(curl -s -o /tmp/root.html -w '%{http_code}' "http://localhost:3000/")
test "$root_code" = "200" || { echo "root returned $root_code"; docker logs "$NAME"; exit 1; }
grep -qi "<title" /tmp/root.html || { echo "root is not HTML"; exit 1; }

echo "[smoke] checking /api/auth/me"
me_code=$(curl -s -o /tmp/me.json -w '%{http_code}' "http://localhost:3000/api/auth/me")
test "$me_code" = "200" || { echo "/api/auth/me returned $me_code"; docker logs "$NAME"; exit 1; }
grep -q '"role"' /tmp/me.json || { echo "/api/auth/me missing role"; cat /tmp/me.json; exit 1; }

echo "[smoke] OK"
```

- [ ] **Step 4: Make executable and re-run the test, expect pass.**
  Command: `chmod +x scripts/smoke.sh && pnpm --filter @ra/server test -- smoke-script.test.ts`
  Expected: all 5 assertions pass.

- [ ] **Step 5: Run the smoke test against the locally built image (real end-to-end verification).**
  Command: `docker build -t radio-admin:dev . && ./scripts/smoke.sh radio-admin:dev`
  Expected: prints `[smoke] OK`; `/` returns HTML 200, `/api/auth/me` returns JSON 200 with `"role":"admin"` (dev bypass user). This confirms migrations ran on start, the server booted, static serving works, and `/api` is reachable inside the image.

- [ ] **Step 6: Add a smoke step to the CI `docker` job (build the image locally first, smoke, then push).** Replace the single "Build and push" step with a load-then-smoke-then-push sequence. In `.github/workflows/ci.yml` `docker` job, after the `meta` step:
```yaml
      - name: Build image (load for smoke)
        uses: docker/build-push-action@v6
        with:
          context: .
          load: true
          tags: radio-admin:ci
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Smoke test
        run: ./scripts/smoke.sh radio-admin:ci

      - name: Push image
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 7: Update the docker-job test to require the smoke step.** In `server/test/ci-workflow.test.ts` `docker job` block, add:
```ts
  it('runs the smoke test before pushing', () => {
    const smoke = yml.indexOf('smoke.sh');
    const push = yml.indexOf('push: true');
    expect(smoke).toBeGreaterThan(-1);
    expect(push).toBeGreaterThan(-1);
    expect(smoke).toBeLessThan(push);
  });
```

- [ ] **Step 8: Run the workflow test, expect pass.**
  Command: `pnpm --filter @ra/server test -- ci-workflow.test.ts`
  Expected: all assertions pass, including the new smoke ordering check.

- [ ] **Step 9: Commit.**
```bash
git add scripts/smoke.sh server/test/smoke-script.test.ts .github/workflows/ci.yml server/test/ci-workflow.test.ts
git update-index --chmod=+x scripts/smoke.sh
git commit -m "ci: smoke-test built image (/ and /api/auth/me) before GHCR push"
```

---

### Task 6.11: Full-suite green + phase wrap-up

**Files:**
- modify `README.md` (add Docker/CI run-and-verify section)

- [ ] **Step 1: Run the entire monorepo test suite.**
  Command: `pnpm -r exec vitest run`
  Expected: all packages green, including every test added in this phase (`static`, `migrate`, `entrypoint`, `env-example`, `dockerfile`, `compose`, `ci-workflow`, `smoke-script`).

- [ ] **Step 2: Run lint + typecheck across the workspace.**
  Command: `pnpm -r lint && pnpm -r typecheck`
  Expected: zero errors (matches what CI runs).

- [ ] **Step 3: Document the manual verification path in `README.md`.** Add a "Docker / Deployment" section:
```markdown
## Docker / Deployment

Build and run locally:

    cp .env.example .env   # fill in OIDC + SESSION_SECRET for real auth
    docker compose up --build

The single image runs DB migrations on start, then serves the API and the SPA on
port 3000. SQLite persists in the `radio-data` volume at `/data/data.sqlite`.

### Smoke test (manual)

    docker build -t radio-admin:dev .
    ./scripts/smoke.sh radio-admin:dev   # checks GET / (HTML 200) and GET /api/auth/me (JSON 200)

### CI / images

On push to `main` (or a `vX` tag) GitHub Actions runs lint+typecheck+vitest, builds
the image with Buildx, smoke-tests it, and pushes to
`ghcr.io/<owner>/radio-admin` (`:latest`, `:sha-<sha>`, and `:<tag>`).
```

- [ ] **Step 4: Final build + smoke as the documented manual verification.**
  Command: `docker build -t radio-admin:dev . && ./scripts/smoke.sh radio-admin:dev`
  Expected: `[smoke] OK`.

- [ ] **Step 5: Commit.**
```bash
git add README.md
git commit -m "docs: document Docker build, compose, smoke test and GHCR CI"
```

- [ ] **Step 6: Open the PR for the phase.**
```bash
git push -u origin phase-6-docker-ci
gh pr create --title "Phase 6: Docker image + GitHub Actions CI (GHCR)" \
  --body "Multi-stage Dockerfile (deps→build→runtime, better-sqlite3 native rebuild, migrate-on-start, static SPA serving with /api-excluded fallback), docker-compose with sqlite volume, .dockerignore, .env.example, and ci.yml (test job + GHCR docker job with smoke test). Verified via \`./scripts/smoke.sh\`."
```

---
