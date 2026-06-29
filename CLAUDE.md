# radio-admin — Projekt-Konventionen

Funkgeräte-Verwaltung (TETRA/BOS) für eine HiOrg. pnpm-Monorepo: `@ra/shared` (Zod + reine Logik), `@ra/server` (Hono + Drizzle + better-sqlite3, serviert API + SPA), `@ra/client` (Vite + React 19 + Ant Design 5). Ein Docker-Image → GHCR.

## Datenbank-Migrationen — APPEND-ONLY (kritisch)

Drizzle verfolgt angewendete Migrationen per **Hash** in `__drizzle_migrations`. Wird eine bestehende Migrationsdatei neu generiert, ändert sich ihr Hash → auf bereits deployten Datenbanken versucht Drizzle, sie erneut anzuwenden → `CREATE TABLE … already exists` und Crash-Loop. Das hat einmal Produktion lahmgelegt.

**Regeln:**
- **NIEMALS** `server/drizzle/*.sql` oder `server/drizzle/meta/` löschen oder bestehende Migrationen regenerieren.
- Schema-Änderung: `server/src/db/schema.ts` editieren → aus `server/` `node_modules/.bin/drizzle-kit generate` → das **hängt eine neue** `000N_*.sql` an und aktualisiert `meta/` (ALTER TABLE für bestehende DBs). Neue Datei **und** den aktualisierten Snapshot committen.
- `0000_confused_thena.sql` ist die eingefrorene Baseline (alle 5 Tabellen). Nicht anfassen.
- Migration ist fail-fast (kein „tolerate already-exists") — bewusst so, deckt echte Drift auf.

## Verifizieren — direkte Binaries (der rtk-Hook maskiert Exit-Codes!)

Der `rtk`-Proxy kann Exit-Codes verschlucken (zeigt „EXIT 0" bei Fehler). Gates immer direkt prüfen:
`./node_modules/.bin/vitest run`, `./node_modules/.bin/tsc --noEmit -p {shared,server,client}/tsconfig.json`, `./node_modules/.bin/eslint .`, `pnpm --filter @ra/client build`. eslint: `@typescript-eslint/no-explicit-any` ist **error** — kein `any`.

## Konventionen

- **TDD**, Commit pro logischer Änderung; Commit-Messages enden mit `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Rollen:** admin (alles) / updater (darf nur `UPDATER_EDITABLE_FIELDS` = softwareVersion/lastUpdatedAt/status setzen, serverseitig via `filterEditableFields` erzwungen). Master-Felder (issi, loanable, …) sind admin-only.
- **Update-Stand** ist berechnet (nicht gespeichert): `aktuell`, wenn die Geräteversion der explizit als Ziel markierten Softwareversion entspricht (`isTarget`-Flag in `software_versions`, gelesen via `getReferenceVersion`). Der Admin setzt das Ziel über die Versionsverwaltung (`POST /api/software-versions/:id/target`) — **keine** automatische Ableitung mehr aus `createdAt`. Neue/auto-erfasste Versionen werden nie automatisch Ziel; `sortOrder` ist nur Anzeige-Reihenfolge.
- **Client↔Server-Contracts:** Server-Listen liefern teils Envelopes (`/api/suggestions` → `{values:[]}`), nicht nackte Arrays — neue Endpunkte gegen die echte Route-JSON prüfen, nicht annehmen.
- **Auth:** BFF (PocketID OIDC, httpOnly-Session-JWT). Lokal `AUTH_DEV_BYPASS=true` überspringt Login. Audit-Felder speichern `user.sub`; Namen werden über die `users`-Tabelle aufgelöst.

## Lokal starten

`pnpm install && pnpm dev` (Server mit Dev-Bypass + Vite). Prod: `docker compose up --build` (Migrationen laufen im Entrypoint, SQLite im Volume unter `/data`).
