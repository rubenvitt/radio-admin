# Loan-Datenhoheit: radio-inventar → radio-admin

**Status:** Architektur entworfen & abgestimmt. Implementierung noch nicht begonnen.
**Richtung:** Option B — radio-admin wird System-of-Record für Ausleihen (Loans). Erster Schritt der Konsolidierung auf radio-admin.

Schwester-Doku (umgekehrte Richtung, bereits umgesetzt): `radio-inventar/docs/integration-radio-admin.md` (radio-inventar bezieht Geräte read-only aus radio-admin).

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
- **D4 — Migration: einmaliges Direkt-DB-Skript in `scripts/`, kein permanenter Import-Endpunkt.** Kein dauerhafter Schreib-Angriffspunkt für einen Einmal-Bedarf. Skript liest Postgres (`pg`), prüft jede `device_id` gegen radio-admin (Orphan-Report), `INSERT … ON CONFLICT(id) DO NOTHING` (idempotent, übernimmt Original-IDs, konvertiert DateTime→epoch-ms).
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
`server/src/scripts/migrate-loans.ts`: Postgres → SQLite, aktiv + ≤2 Monate, Orphan-Check, idempotent. Gegen Staging testen (`--dry-run`).

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
