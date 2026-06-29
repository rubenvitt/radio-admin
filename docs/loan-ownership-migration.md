# Loan-Datenhoheit: radio-inventar → radio-admin

**Status:** **Code-vollständig (Phasen 1–5) & verifiziert** auf lokalen Branches — radio-admin `feat/loan-ownership-migration`, radio-inventar `feat/loan-thin-client`. **Nicht gepusht / kein PR.** Der eigentliche Prod-**Cutover** (Migration + Deploy in der richtigen Reihenfolge) ist eine operative Aufgabe — siehe Runbook unten.
**Richtung:** Option B — radio-admin wird System-of-Record für Ausleihen (Loans). Erster Schritt der Konsolidierung auf radio-admin.

## Verifikation (Stand: umgesetzt)
- **radio-admin** (`feat/loan-ownership-migration`, Basis `main` nach FF-Merge des Ziel-Versions-Features `154ccf9`): **352 server/shared + 59 client vitest**, tsc ×3, eslint 0 Fehler, Client-Build grün. Migration `0003_kind_spot.sql` (Tabelle + Indizes + hand-ergänzter Partial-Unique-Index) appliziert sauber.
- **radio-inventar** (`feat/loan-thin-client`): **541 unit jest**, tsc + Build (shared/backend/frontend) grün. Drop-Migration `20260629120000_drop_loan` via `prisma migrate deploy` sauber angewendet (nur `AdminUser` bleibt).
- **End-to-End verdrahtet** (beide Apps lokal über den api-token-Modus gekoppelt): kompletter Kiosk-Flow durch radio-inventar schreibt korrekt nach radio-admin durch — Geräte AVAILABLE→ON_LOAN→AVAILABLE (Overlay aus radio-admin), Zeitstempel als **ISO-Strings** (ms→Date korrekt), Borrower-Autocomplete bedient, zweite Ausleihe **409** (Atomarität durchgereicht), Rückgabe mit Notiz — und `radio-admin GET /api/loans` zeigt die Ausleihe (sie liegt in radio-admin).
- **Migrationsskript** `server/scripts/import-loans.ts` gegen echtes Postgres getestet (3 Loans inkl. Umlaut-Namen gelesen/importiert, idempotent).
- **Adversarialer Multi-Agent-Review** (5 Dimensionen) durchgeführt; alle bestätigten Funde gefixt (kritisch: cuid2-Loan-ID-Validierung in `admin.schema`; plus 5xx→503, History-catch-Logging, env-Prod-Guard, Umlaut-Case-Folding, import-TZ-UTC).

Schwester-Doku (umgekehrte Richtung, bereits umgesetzt): `radio-inventar/docs/integration-radio-admin.md` (radio-inventar bezieht Geräte read-only aus radio-admin).

---

## ⚠️ Cutover-Runbook (Prod) — Reihenfolge ist kritisch

**Auth/Env zuerst:**
- **radio-admin (prod):** für den client_credentials-JWT-Pfad `OIDC_ISSUER` + `LOAN_API_EXPECTED_AUDIENCE` (der von Pocket ID emittierte `aud`) setzen; alternativ minten Operatoren einen api-token in der Admin-UI.
- **radio-inventar (prod):** `RADIO_ADMIN_URL` **+ ein Auth-Modus** sind ab Cutover **Pflicht** (env-Validierung erzwingt das in `NODE_ENV=production`): entweder `RADIO_ADMIN_API_TOKEN` (≥32 Zeichen) **oder** das client_credentials-Trio `RADIO_ADMIN_ISSUER_URL`/`CLIENT_ID`/`CLIENT_SECRET`. (`RADIO_ADMIN_*` lag in Prod bereits für die Geräte-Reads vor.)

**Reihenfolge (kein Split-Brain, kein Datenverlust):**
1. **radio-admin deployen** (`feat/loan-ownership-migration`): Migration `0003` legt die `loans`-Tabelle an; `LOAN_API_EXPECTED_AUDIENCE` gesetzt; S2S-Auth gegen einen echten client_credentials-Token verifizieren.
2. **Kiosk einfrieren** (kurzer Wartungs-/Read-only-Fenster) — keine neuen Ausleihen.
3. **Migration laufen** (radio-admin nicht-schreibend): aus `server/` mit `TZ=UTC` ausführen — `cd server && TZ=UTC INVENTAR_DATABASE_URL=… DATABASE_PATH=/data/data.sqlite npx tsx scripts/import-loans.ts --dry-run` (Zähler prüfen), dann ohne `--dry-run`. **Eine Stichprobe-Zeitstempel** gegen die Quelle gegenprüfen.
4. **radio-inventar Thin-Client deployen** (`feat/loan-thin-client`): Entrypoint führt `prisma migrate deploy` aus → `drop_loan` **droppt die Postgres-`Loan`-Tabelle**. Ab hier gehen alle Schreibvorgänge an radio-admin.
5. **Kiosk freigeben.**

**Rollback:** Vor Schritt 4 sauber (altes radio-inventar redeployen, Postgres unverändert, da der Import nur eine Kopie war). **Nach** Schritt 4 ist die Postgres-`Loan`-Tabelle weg → Rollback erfordert ein Postgres-Backup (und ggf. Rück-Migration der in radio-admin neu entstandenen Ausleihen).

**Akzeptierte Verhaltensänderung:** Ein radio-admin-Ausfall blockiert nach Cutover Kiosk-Borrow/Return (503) — `RadioAdminService.fetchActiveLoans` ist bewusst ungecacht (frischer Overlay nach Borrow/Return wichtiger als Ausfall-Resilienz). Geräte-Reads haben weiterhin stale-grace.

---

## Ausgangslage (verifiziert)

- **radio-admin** (Hono + Drizzle + better-sqlite3): Datenhoheit über **Geräte**. Exponiert `GET /api/v1/loan-devices` (nur `loanable=true`) an radio-inventar; Dual-Auth (`requireLoanApiAuth` = api-token via `verifyApiToken` ODER OIDC client_credentials JWT via `verifyLoanJwt`), bewusst VOR dem Session-Guard gemountet (`app.ts:50`). Kennt selbst **keine** Ausleihen, nur `devices.loanable`. Repos = reine Funktionen `(db, …)`. Migrationen APPEND-ONLY (`drizzle-kit generate`, nie bestehende SQL ändern). Client: React 19 + Ant Design 5 + TanStack Query v5 + React Router v6, BFF-Session.
- **radio-inventar** (NestJS + Prisma + Postgres): Datenhoheit über **Loans**. `Loan`-Modell mit Snapshot-Spalten + Partial-Unique-Index `loans_device_active_uidx WHERE returnedAt IS NULL`. Loan-Endpunkte `/api/loans` `@Public()` + globaler statischer `ApiTokenGuard`. Geräte read-only aus radio-admin via `RadioAdminService` (client_credentials). Verfügbarkeit/ON_LOAN heute aus **lokalen** Loans abgeleitet (Dashboard, Geräte-Overlay, Ausleih-Check). **Löscht zurückgegebene Loans > 2 Monate bei jedem Read** (`deleteExpiredHistoryEntries`) — kein Langzeit-Archiv.

## Fixe Entscheidungen (vom Nutzer bestätigt)

1. radio-admin = Loan-Master (neue `loans`-Tabelle, Repo, APIs, Übersichts-UI).
2. Umfang: laufende Ausleihen + ~2 Monate Historie zurückgegebener (2-Monats-Retention gespiegelt).
3. Langfristig: Konsolidierung auf radio-admin; radio-inventar wird später verschlankt.
4. radio-inventar behält seine Ausleih-/Rückgabe-**Kiosk-UI**, schreibt aber per S2S an radio-admin durch (**Thin-Client**). Lokale Postgres-Loan-Tabelle entfällt nach Migration.
5. Ausleihen/Zurückgeben muss OHNE persönlichen OIDC-Login möglich bleiben (Kiosk) → radio-admin braucht eine **token-/JWT-gesicherte Schreib-Fläche** (pre-guard), nicht nur die OIDC-UI.
6. Laufende + jüngste Ausleihen werden einmalig **migriert** (Postgres → radio-admin SQLite).

## Bewusst akzeptierte Trade-offs

- **Kiosk-Schreibverfügbarkeit koppelt an radio-admin-Uptime.** Heute schreibt Borrow/Return lokal (immer verfügbar); nach Cutover blockt ein radio-admin-Ausfall das Ausleihen. Lese-Status (Overlay) wird durch Cache/stale-grace abgefedert, Schreiben failt hart. Konsequenz der fixen Entscheidung.
- **Übersicht ist bis zum Cutover leer.** Loans leben bis Migration in radio-inventar; die neue `/ausleihen`-Seite in radio-admin zeigt erst nach Migration + Schreib-Cutover Live-Daten. Phasierung entkoppelt Build-Risiko, nicht sichtbaren Wert.

---

## Architektur (vereinheitlicht)

### Datenmodell — radio-admin `loans`-Tabelle

```
loans (
  id                    text PK ($defaultFn newId; Migration übernimmt Original-cuid v1),
  device_id             text NOT NULL,          -- KEIN FK (s. Entscheidung D2)
  snapshot_call_sign    text NOT NULL,
  snapshot_serial_number text,
  snapshot_device_type  text,
  borrower_name         text NOT NULL,
  borrowed_at           integer NOT NULL,        -- epoch ms
  returned_at           integer,                 -- null = aktiv
  return_note           text,
  created_at            integer NOT NULL,
  updated_at            integer NOT NULL
)
-- Partial-Unique-Index HAND-ergänzt in der generierten Migration (drizzle-kit kann
-- kein WHERE-Index emittieren):
CREATE UNIQUE INDEX loans_device_active_uidx ON loans(device_id) WHERE returned_at IS NULL;
CREATE INDEX loans_borrowed_at_idx ON loans(borrowed_at);
CREATE INDEX loans_returned_at_idx ON loans(returned_at);
```

### Auth-Flächen

- **S2S (pre-guard, in `loanApi.ts`, `requireLoanApiAuth`)** — vom radio-inventar-Kiosk aufgerufen:
  - `POST /api/v1/loans` — anlegen
  - `PATCH /api/v1/loans/:loanId` — zurückgeben
  - `GET  /api/v1/active-loans` — alle aktiven Loans (für radio-inventar Geräte-Overlay + Dashboard)
  - `GET  /api/v1/loans/history` — paginierte Historie (für radio-inventar Admin-History)
- **Session (post-guard, neue `routes/loans.ts`)** — von der radio-admin-eigenen Übersicht aufgerufen:
  - `GET  /api/loans` — paginierte Übersicht (aktiv + zurückgegeben)
  - `GET  /api/loans/active`
  - `POST /api/loans/purge` — manueller Retention-Purge (Rolle `admin`)

Fehler-Shape konsistent `{ error: string }`: `device_not_found` (404), `device_not_loanable` (409), `device_not_available` (409, defekt/wartung), `device_already_on_loan` (409, Partial-Index-Verletzung), `loan_not_found` (404), `loan_already_returned` (409).

### Fünf Schlüssel-Entscheidungen (mit Begründung)

- **D1 — Status-Exposition: dedizierter `GET /api/v1/active-loans`, NICHT `/loan-devices` erweitern.** `/loan-devices` filtert `loanable=true`; ein Loan auf einem nachträglich auf nicht-ausleihbar gesetzten Gerät würde sonst still verschwinden (Zähl-Bug im Dashboard). Der dedizierte Endpunkt ist der 1:1-Ersatz für radio-inventars `prisma.loan.findMany({returnedAt:null})`.
- **D2 — Kein FK auf `loans.device_id`, dafür Snapshots.** Snapshots sichern die Historie-Unveränderlichkeit (Gerät umbenannt/gelöscht). FK+`RESTRICT` würde auch das Löschen von Geräten mit nur *zurückgegebenen* (noch nicht gepurgten) Loans blockieren → Reibung. Sicher ohne FK, weil der `POST`-Handler die Geräte-Existenz ohnehin via `getDeviceById` prüft. Falls die Invariante „Gerät mit aktiver Ausleihe nicht löschbar" gewünscht ist → expliziter Check im Device-Delete-Handler, nicht als FK.
- **D3 — Retention: geplanter Purge, kein lazy-on-read.** `borrower_name` ist personenbezogen (DSGVO/DRK) → muss garantiert gelöscht werden, nicht nur „bei Gelegenheit beim Lesen". `retentionService.ts`: `purgeExpiredLoans(db, cutoffMs)` (rein, testbar) + `startRetentionSchedule(db)` (Startup-Purge + täglicher `setInterval().unref()`), aufgerufen aus `startServer()` (NICHT `buildApp` — Tests bleiben seiteneffektfrei). `HISTORY_RETENTION_MONTHS = 2`. Plus manueller Admin-Purge-Endpunkt.
- **D4 — Migration: einmaliges Direkt-DB-Skript `server/scripts/import-loans.ts` (aus `server/` ausführen, `pg` als server-devDep), kein permanenter Import-Endpunkt.** Kein dauerhafter Schreib-Angriffspunkt für einen Einmal-Bedarf. Skript liest Postgres (`pg`, mit UTC-Type-Parser für TIMESTAMP), `INSERT … ON CONFLICT(id) DO NOTHING` (idempotent, übernimmt Original-IDs, konvertiert DateTime→epoch-ms), Preflight-Warnung bei bereits gefüllter Ziel-Tabelle. **Kein** Orphan-/Device-Check nötig — `loans.device_id` hat keinen FK und die Snapshots machen Loans device-unabhängig.
- **D5 — Invarianten am Master zentralisieren.** Der `POST /api/v1/loans`-Handler prüft `loanable` UND defekt/wartung→409, weil der Kiosk *offen* ist und der Master dem Client nicht vertrauen darf. **Konsequenz:** die `mapRadioAdminStatus`-Semantik (defekt→DEFECT, wartung→MAINTENANCE) muss nach radio-admin portiert werden (`@ra/shared` oder inline in `loanApi.ts`).

### Kollisionsfalle (kritisch)

`app.onError` mappt JEDE `SQLITE_CONSTRAINT_UNIQUE` auf `{error:'issi_conflict'}` (409). Der Loan-Insert MUSS den Partial-Index-Verstoß **lokal** in `createLoan`/im Route-Handler fangen und als `device_already_on_loan` (409) zurückgeben, bevor er den globalen Handler erreicht. Pflicht-Test: anlegen → zurückgeben → erneut anlegen auf demselben Gerät muss **gelingen** (verifiziert das `WHERE returned_at IS NULL`-Prädikat); zweite *aktive* Ausleihe muss 409 werfen.

### Contract-Heimat

Autoritative Zod-Schemas in radio-admins `@ra/shared` (`shared/src/loan.ts`) — das Paket, das die Konsolidierung überlebt. radio-inventar spiegelt nur einen dünnen Response-Validierungs-Klon (`packages/shared/src/schemas/radio-admin-loan.schema.ts`), analog zum bestehenden `RadioAdminLoanDeviceSchema`.

---

## S2S-Schreib-Auth — GEKLÄRT

Die bestehende Lese-Integration (radio-inventar zieht Geräte aus radio-admin) läuft **produktiv mit echtem client_credentials-Token** (Nutzer bestätigt 2026-06-29). Der JWT-Pfad ist damit **bewiesen** → die neuen S2S-Schreib-Endpunkte werden unter denselben `requireLoanApiAuth`-Guard gehängt (JWT ODER api-token), keine neue Auth-Arbeit nötig. Der frühere `aud`/`sub`-Spike ist damit erledigt.

---

## Phasenplan (additiv zuerst, kein Split-Brain)

### Phase 1 — radio-admin Loan-Master (rein additiv, null Risiko für radio-inventar, eigenständig deploybar)
1. `@ra/shared`: `shared/src/loan.ts` (Zod-Schemas + Typen: createLoan, returnLoan, loanRecord, activeLoan, loanHistoryParams) + `index.ts`-Re-Export.
2. `server/src/db/schema.ts`: `loans`-Tabelle. → `drizzle-kit generate` → Partial-Unique-Index + Indizes in die generierte `0003_*.sql` HAND-ergänzen → SQL + `meta/`-Snapshot committen.
3. `server/src/repos/loanRepo.ts` (reine Funktionen): `createLoan`, `returnLoan`, `getLoanById`, `findActiveLoans`, `listLoans`, `purgeExpiredLoans`. + TDD-Tests (Pflicht: borrow→return→re-borrow; doppelte aktive→409; atomarer Return; Retention-Cutoff).
4. `server/src/services/retentionService.ts` (+ Tests): Cutoff-Berechnung, `runPurge`, `startRetentionSchedule`.
5. `server/src/routes/loanApi.ts` ERWEITERN: `POST /v1/loans`, `PATCH /v1/loans/:loanId`, `GET /v1/active-loans`, `GET /v1/loans/history` (alle unter `requireLoanApiAuth`). Geräte-Validierung + defekt/wartung-Guard im POST-Handler. + Route-Tests (201/400/404/409/401).
6. `server/src/routes/loans.ts` (neu, session-guarded) + Mount in `app.ts` nach `requireAuth`. `server/src/index.ts`: `startRetentionSchedule(db)` in `startServer()`.
7. Client: `hooks/useLoans.ts` (o. `features/loans/useLoan.ts`), `features/loans/LoanList.tsx` (+ `loanColumns.tsx`), `pages/LoansPage.tsx`, Route `/ausleihen` in `routes/router.tsx`, Nav-Eintrag in `layout/AppLayout.tsx`. + Tests.
8. **Gate:** `vitest run`, `tsc --noEmit -p {shared,server,client}`, `eslint .`, `pnpm --filter @ra/client build` — alle grün.

### Phase 2 — Cutover-Auth klären (BLOCKING-Gate, s. o.)
Prod-Auth-Status der Lese-Integration prüfen → api-token vs. JWT für Writes festlegen.

### Phase 3 — Migration (einmalig)
`server/scripts/import-loans.ts`: Postgres → SQLite, aktiv + ≤2 Monate, idempotent (`ON CONFLICT(id) DO NOTHING`), UTC-Type-Parser. Aus `server/` mit `TZ=UTC` ausführen, erst `--dry-run`.

### Phase 4 — radio-inventar Thin-Client (Cutover)
1. `packages/shared/src/schemas/radio-admin-loan.schema.ts` (+ Export).
2. `RadioAdminService` ERWEITERN: `fetchActiveLoans`, `createLoan`, `returnLoan`, `fetchLoanHistory` (bestehende Token-Maschinerie wiederverwenden; nach Write Device-Cache invalidieren oder kein Cache für active-loans).
3. `loans.repository.ts`: alle drei Methoden auf `RadioAdminService` delegieren (kein Prisma-Loan-Write mehr).
4. `devices.service.ts`: `prisma.loan.findMany({returnedAt:null})` → `radioAdminService.fetchActiveLoans()`.
5. `admin/history/history.repository.ts`: Dashboard/History aus radio-admin; `deleteExpiredHistoryEntries` entfernen (Retention liegt jetzt bei radio-admin).
6. **Cutover-Fenster:** radio-admin deployen → Kiosk kurz einfrieren (503) → Migration laufen + Zähler verifizieren → Thin-Client deployen → Kiosk freigeben. **Rollback:** altes radio-inventar redeployen; Postgres unverändert.
7. **Gate:** radio-inventar `vitest run`, `tsc --noEmit`.

### Phase 5 — Cleanup (separat, nach Bestätigung dass radio-admin Master ist)
`Loan`-Modell aus `prisma.schema` entfernen + DROP-Migration; toten Prisma-Loan-Code entfernen; ggf. radio-inventar Admin-History-UI ablösen.

---

## Dateien (Überblick)

**radio-admin neu:** `shared/src/loan.ts`, `server/drizzle/0003_*_loans.sql`, `server/src/repos/loanRepo.ts`(+test), `server/src/services/retentionService.ts`(+test), `server/src/routes/loans.ts`, `server/test/loanApiWrite.test.ts`, `server/src/scripts/migrate-loans.ts`, `client/src/features/loans/*`, `client/src/pages/LoansPage.tsx`.
**radio-admin ändern:** `shared/src/index.ts`, `server/src/db/schema.ts`, `server/drizzle/meta/*`, `server/src/routes/loanApi.ts`, `server/src/app.ts`, `server/src/index.ts`, `client/src/routes/router.tsx`, `client/src/layout/AppLayout.tsx`.
**radio-inventar neu:** `packages/shared/src/schemas/radio-admin-loan.schema.ts`.
**radio-inventar ändern:** `packages/shared/src/index.ts`, `apps/backend/src/modules/radio-admin/radio-admin.service.ts`, `…/loans/loans.repository.ts`, `…/devices/devices.service.ts`, `…/admin/history/history.repository.ts`, `apps/backend/prisma/schema.prisma` (Phase 5).

## Setup-Gotchas (aus Vorgänger-Doku)
- radio-admin: `better-sqlite3` ggf. für Node 24 aus Source bauen (sonst NODE_MODULE_VERSION-Mismatch in vitest). Gates direkt prüfen (rtk-Hook maskiert Exit-Codes). eslint `no-explicit-any` = error.
- radio-inventar: nach `pnpm install` zwingend `prisma generate`; eigenes Postgres via `pnpm db:up`.
