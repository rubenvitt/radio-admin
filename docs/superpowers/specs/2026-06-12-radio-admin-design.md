# Design-Spec: Funkgeräte-Verwaltung (radio-admin)

**Datum:** 2026-06-12
**Status:** Entwurf zur Review
**Kontext:** Verwaltung von Funkgeräten (TETRA/BOS) in einer weißen HiOrg. Greenfield-Projekt.

---

## 1. Überblick & Ziele

Eine moderne Web-App zur Verwaltung des Funkgeräte-Bestands einer Hilfsorganisation.
Kernaufgaben:

- Geräte erfassen, suchen, filtern, bearbeiten.
- Software-/Update-Stände dokumentieren und auf einen Blick sehen, welche Geräte
  veraltet sind (Dashboard).
- Bulk-Update der Stände per CSV-Import (Export aus der Programmiersoftware) mit
  automatischem Abgleich über die ISSI.
- Schnelle, moderne UX (Comboboxen, Dark/Light, responsiv für PC/Tablet/Smartphone).
- Auth über PocketID (OIDC), lokal im Dev-Modus überspringbar.

### Nicht-Ziele (YAGNI für v1)

- Keine Mandantenfähigkeit / mehrere HiOrgs.
- Keine E2E-Tests in v1 (Playwright optional später).
- Keine Stammdaten-Verwaltungs-UI für Standorte/Typen (Comboboxen sind Auto-Listen).
- Keine manuelle Ziel-Versions-Definition (die zuletzt angelegte Version ist die Zielversion).
- Keine Self-Service-Nutzerverwaltung (Nutzer/Rollen kommen aus PocketID).

---

## 2. Tech-Stack & Repo-Struktur

**Monorepo** mit pnpm-Workspaces, drei Pakete:

```
radio-admin/
├─ shared/        # Zod-Schemas, TS-Typen, reine Logik (Rollen-Mapping, Update-Stand, CSV-Diff)
├─ server/        # Hono (Node) – serviert /api/* UND das gebaute Client-Bundle
├─ client/        # Vite + React 19 + TS – SPA
├─ Dockerfile     # Multi-Stage, ein Image
├─ docker-compose.yml  # lokal (mit Volume)
└─ .github/workflows/ci.yml
```

**Begründung Trennung:** `shared` enthält reine, isoliert testbare Logik und die einzige
Quelle für Typen/Validierung (end-to-end typsicher: Server validiert Eingaben mit denselben
Zod-Schemas, die der Client zur Typisierung nutzt).

### Libraries

| Bereich | Wahl | Version |
|---|---|---|
| Frontend-Build | Vite | 6.x |
| UI-Framework | React + React DOM | 19.x |
| Sprache | TypeScript | 5.x |
| Routing | react-router-dom (Data Router) | 7.x |
| Server-State | @tanstack/react-query | 5.x |
| UI-Kit | antd | 5.x |
| Datum (antd-Peer) | dayjs | 1.x |
| Icons | react-icons | 5.x |
| HTTP-Server | hono + @hono/node-server | 4.x |
| ORM | drizzle-orm + better-sqlite3 | aktuell |
| Migrationen | drizzle-kit (dev) | aktuell |
| OIDC | openid-client | 6.x (funktionale API) |
| Session-Cookie | jose (signiertes JWT) | aktuell |
| CSV | csv-parse | aktuell |
| Encoding | chardet + iconv-lite | aktuell |
| Validierung | zod | 3.x |
| Tests | vitest | 3.x |

> Hinweis React 19 + antd 5: antd unterstützt React 19; ggf. `@ant-design/v5-patch-for-react-19`
> einbinden, falls Warnungen zu `ReactDOM.render`/Wave-Effekt auftreten.

---

## 3. Datenmodell

### Tabelle `devices`

| Feld | Typ | Constraints | Bedeutung |
|---|---|---|---|
| `id` | text (cuid2) | PK | |
| `rufname` | text | | Rufname, Combobox |
| `issi` | text | **unique, not null** | TETRA ISSI – Match-Key für CSV |
| `serialNumber` | text | nullable | Seriennummer / Inventar-Nr. |
| `deviceType` | text | nullable | Gerätetyp/Modell, Combobox |
| `status` | text | nullable | Zustand (einsatzbereit / in Reparatur / ausgemustert / verloren), Combobox |
| `location` | text | nullable | Standort, Combobox |
| `assignedTo` | text | nullable | Zuständige Person/Gruppe, Combobox |
| `softwareVersion` | text | nullable | **„Letztes Update"** = aufgespielter Softwarestand. Verweist auf `software_versions.value` |
| `lastUpdatedAt` | integer (unix ms) | nullable | **„Zuletzt aktualisiert"** = Datum des Updates (Fachdatum, vom Nutzer/Import gesetzt) |
| `notes` | text | nullable | Freitext |
| `createdAt` | integer | not null | System-Zeitstempel |
| `updatedAt` | integer | not null | System-Zeitstempel |
| `createdBy` | text | nullable | User-`sub`/Name |
| `updatedBy` | text | nullable | User-`sub`/Name |

### Tabelle `software_versions`

Eigene Tabelle, weil die **Reihenfolge der Anlage** den „Update-Stand" definiert.

| Feld | Typ | Constraints | Bedeutung |
|---|---|---|---|
| `id` | text (cuid2) | PK | |
| `value` | text | **unique, not null** | Versionsbezeichnung, z.B. „FW 12.3" |
| `createdAt` | integer | not null | Anlage-Zeitpunkt – bestimmt „neueste Version" |
| `createdBy` | text | nullable | |

### Tabelle `device_events` (volle Änderungshistorie)

| Feld | Typ | Constraints | Bedeutung |
|---|---|---|---|
| `id` | text (cuid2) | PK | |
| `deviceId` | text | FK → devices.id, indexiert | |
| `field` | text | not null | geändertes Feld (z.B. `softwareVersion`) |
| `oldValue` | text | nullable | |
| `newValue` | text | nullable | |
| `changedBy` | text | nullable | User-`sub`/Name |
| `changedAt` | integer | not null | |
| `source` | text | not null | `manual` \| `csv-import` \| `create` |

Bei jeder Änderung (manuell oder per CSV) wird pro geändertem Feld ein Event geschrieben.
Anzeige als Timeline im Detail-Drawer.

### Berechneter „Update-Stand" (nicht gespeichert)

**Referenz-/Zielversion** = die zuletzt angelegte Softwareversion, die **aktuell mindestens einem
Gerät zugewiesen** ist — d.h. `max(createdAt)` nur über die Versionen, die in `devices`
tatsächlich verwendet werden:

```sql
SELECT sv.value FROM software_versions sv
WHERE EXISTS (SELECT 1 FROM devices d WHERE d.softwareVersion = sv.value)
ORDER BY sv.createdAt DESC LIMIT 1
```

Diese „+ einem Gerät zugewiesen"-Bedingung ist bewusst gewählt: Eine angelegte, aber keinem Gerät
zugewiesene Version (Tippfehler, Korrektur, Unassign) verschiebt die Zielversion **nicht** und
kann nicht versehentlich alle Geräte auf `veraltet` kippen.

Pro Gerät wird der Status zur Laufzeit berechnet:

- `device.softwareVersion == null` → **`unbekannt`** (Badge grau)
- `device.softwareVersion === referenzVersion.value` → **`aktuell`** (Badge grün)
- sonst → **`veraltet`** (Badge rot)

Sobald jemand eine neue Softwareversion anlegt (per Combobox) **und einem Gerät zuweist**, wird
diese automatisch zur Zielversion; alle Geräte mit älteren Versionen gelten als veraltet. Die
Logik liegt in `shared/` (`computeUpdateStatus(device, referenceVersion)`, `referenceVersion`
wird vom Server aus der obigen Abfrage geliefert) und ist unit-getestet.

---

## 4. Comboboxen / Auto-Listen

„Verwaltete Auto-Listen": Comboboxen schlagen die bereits genutzten Werte vor und erlauben
spontanes Anlegen neuer Werte. Kein Stammdaten-Pflegeaufwand.

- **Allgemeine Felder** (`rufname`, `deviceType`, `status`, `location`, `assignedTo`):
  Vorschläge per `SELECT DISTINCT <feld> FROM devices`. Neue Werte entstehen implizit beim
  Speichern. Endpoint `GET /api/suggestions?field=location`.
- **`softwareVersion`** (Sonderfall): Vorschläge aus `software_versions` (nicht distinct aus
  devices), weil hier der Anlage-Zeitpunkt zählt. Tippt jemand eine neue Version, legt der
  Server beim Speichern einen `software_versions`-Eintrag mit `createdAt` an.

UI: antd `AutoComplete` bzw. `Select` mit `showSearch` + Option zum Anlegen neuer Einträge.

---

## 5. Authentifizierung & Autorisierung

### BFF-Pattern (Tokens bleiben serverseitig)

Der Hono-Server serviert die SPA und besitzt den OIDC-Flow. Die SPA hält **nie** Tokens.

**Flow (openid-client v6, funktionale API):**

1. `GET /api/auth/login` – Server erzeugt `code_verifier`, `code_challenge`, `state`, `nonce`,
   legt diese in einem kurzlebigen, signierten `oauth_tx`-Cookie ab und leitet via
   `client.buildAuthorizationUrl(config, { redirect_uri, scope: 'openid profile email groups',
   code_challenge, code_challenge_method: 'S256', state, nonce })` zu PocketID.
2. `GET /api/auth/callback` – `client.authorizationCodeGrant(config, currentUrl,
   { pkceCodeVerifier, expectedState, expectedNonce, idTokenExpected: true })`. Claims via
   `tokens.claims()`; `groups` ist ein **String-Array** (verifiziert: PocketID liefert `groups`
   im ID-Token UND am userinfo-Endpoint bei Scope `groups`).
3. Server bildet die App-Rolle (siehe Mapping), erstellt ein **signiertes Session-JWT** (jose,
   HS256, Claims `{ sub, name, role, exp }`) und setzt es als **httpOnly-Cookie**
   (`secure` in Prod, `sameSite=lax`). Redirect zur App.
4. `POST /api/auth/logout` – Session-Cookie löschen.
5. `GET /api/auth/me` – `{ name, role }` des aktuellen Nutzers (oder 401).

Stateless: kein Session-Store nötig (ein Container, JWT übersteht Neustarts).

### Rollen-Mapping (env-gesteuert)

Aus dem `groups`-Array wird die App-Rolle abgeleitet:

| Env | Default | App-Rolle |
|---|---|---|
| `OIDC_ADMIN_GROUP` | `admin` | **admin** |
| `OIDC_UPDATER_GROUP` | `personal` | **updater** |

- Enthält `groups` die Admin-Gruppe → **admin** (gewinnt über updater).
- Sonst Updater-Gruppe → **updater**.
- Keine passende Gruppe → **Zugriff verweigert** (403, Hinweisseite).

Mapping-Logik liegt in `shared/` (`mapGroupsToRole(groups, config)`), unit-getestet.

### Dev-Bypass (fail-safe)

- Auth ist **standardmäßig AN**.
- Nur wenn `AUTH_DEV_BYPASS=true`, injiziert eine Middleware einen Fake-User; dessen Rolle
  steuert `DEV_USER_ROLE=admin|updater` (Default `admin`), Name via `DEV_USER_NAME`.
- Beim Serverstart wird eine **laute Warnung** geloggt, solange der Bypass aktiv ist.

### Rollen-Matrix

Die Rolle **updater** dient ausschließlich dem Aktualisieren von Geräten – sonst nichts.

| Aktion | admin | updater |
|---|---|---|
| Geräte ansehen / suchen / Dashboard | ✓ | ✓ |
| **Update-Felder** bearbeiten (Softwareversion, „zuletzt aktualisiert", Status) | ✓ | ✓ |
| **Identitäts-/Stammfelder** bearbeiten (ISSI, Rufname, Serien-Nr., Standort, Zuordnung, Typ, Notizen) | ✓ | ✗ |
| Neue Softwareversion anlegen (Combobox) | ✓ | ✓ |
| Historie ansehen | ✓ | ✓ |
| CSV-Import: bestehende Geräte per ISSI aktualisieren (nur Update-Felder bei updater) | ✓ | ✓ |
| CSV-Import: unbekannte ISSI als **neues Gerät anlegen** | ✓ | ✗ (nur gemeldet, nicht angelegt) |
| Gerät **manuell anlegen** | ✓ | ✗ |
| Gerät **löschen** | ✓ | ✗ |
| Nutzer / Settings | ✓ | ✗ |

**Feld-Allowlist:** updater darf ausschließlich die Felder
`UPDATER_EDITABLE_FIELDS = ['softwareVersion', 'lastUpdatedAt', 'status']` schreiben (Konstante in
`shared/`). Identitätsfelder — insbesondere die **ISSI als CSV-Match-Key** — sind für updater
gesperrt. Dies gilt sowohl bei `PATCH /api/devices/:id` als auch beim CSV-Import-Commit: für
updater werden nur erlaubte Felder gematchter Geräte aktualisiert, abweichende Spalten ignoriert.

Durchsetzung: Hono-Middleware `requireRole('admin')` für admin-exklusive Routen; für die
gemeinsamen Schreibrouten eine **feldbasierte Filterung** nach Rolle (`filterEditableFields(role,
patch)` in `shared/`). Der Client blendet gesperrte Felder/Aktionen je Rolle aus (UX), die
Autorisierung erfolgt aber **serverseitig** (Quelle der Wahrheit).

---

## 6. API-Endpunkte

Alle unter `/api`, JSON, Eingaben per Zod validiert. Auth-Guard (außer Login/Callback).

| Methode | Pfad | Rolle | Zweck |
|---|---|---|---|
| GET | `/api/auth/login` | – | OIDC-Start (Redirect) |
| GET | `/api/auth/callback` | – | Token-Tausch, Session setzen |
| POST | `/api/auth/logout` | any | Session löschen |
| GET | `/api/auth/me` | any | aktueller Nutzer |
| GET | `/api/devices` | any | Liste (Query: `q`, Filter `status`/`location`/`updateStatus`, `sort`, `page`, `pageSize`) |
| GET | `/api/devices/:id` | any | Detail inkl. berechnetem Update-Stand |
| GET | `/api/devices/:id/events` | any | Änderungshistorie |
| POST | `/api/devices` | admin | Gerät anlegen |
| PATCH | `/api/devices/:id` | any | Gerät aktualisieren (Feld-Allowlist je Rolle, schreibt `device_events`) |
| DELETE | `/api/devices/:id` | admin | Gerät löschen |
| GET | `/api/suggestions?field=` | any | Combobox-Vorschläge |
| GET | `/api/software-versions` | any | Versionsliste (+ Markierung „neueste") |
| POST | `/api/import/parse` | any | CSV roh → erkannte Spalten + geparste Zeilen (Vorschau-Datenbasis) |
| POST | `/api/import/commit` | any | Mapping + Zeilen → Upsert (Neuanlage nur admin) |

`GET /api/devices` liefert pro Gerät den berechneten `updateStatus` mit, damit Liste/Filter
ohne Client-Logik funktionieren.

---

## 7. CSV-Batch-Import

Eingeplant auf deutsche-Excel-Realität (`;`-Trenner, cp1252/latin1, BOM, Dezimal-Komma).

**Ablauf (zweistufig, serverseitiges Parsen):**

1. **`POST /api/import/parse`** – Datei wird **roh** hochgeladen (multipart). Server:
   - Encoding erkennen (`chardet`) und nach UTF-8 konvertieren (`iconv-lite`), BOM entfernen.
   - Trennzeichen automatisch erkennen (`;` Default, sonst `,`/`\t`), via `csv-parse`.
   - Antwort: `{ columns: string[], rows: string[][], detected: { delimiter, encoding } }`.
2. **Spalten-Mapping (Client):** UI zeigt erkannte Spalten; Nutzer ordnet zu (welche Spalte ist
   ISSI, Rufname, softwareVersion, …). Auto-Vorschlag per Header-Namensähnlichkeit. **ISSI ist
   Pflicht-Mapping.**
3. **Vorschau (Client → `POST /api/import/commit` mit `dryRun: true`):** Server berechnet den
   Diff je Zeile gegen den Bestand (Match per ISSI) und liefert eine Klassifikation:
   - `created` (ISSI unbekannt – bei updater nur, wenn er anlegen dürfte → hier: als
     `skipped-no-permission` markiert), `updated`, `unchanged`, `error` (z.B. leere ISSI,
     Duplikat in Datei).
   - UI zeigt Vorschau-Tabelle mit Zählern und Detailzeilen.
4. **Commit (`dryRun: false`):** Server führt den Upsert transaktional aus, schreibt
   `device_events` (`source: 'csv-import'`) und legt fehlende `software_versions` an. Neuanlage
   von Geräten nur, wenn Rolle = admin; für updater werden unbekannte ISSI gemeldet, nicht angelegt.

Diff-/Klassifikationslogik liegt in `shared/` (`classifyImportRow`, `diffDevice`), unit-getestet.

---

## 8. Frontend

### Routing (react-router v7, Data Router)

- `/` → Dashboard
- `/devices` → Geräteliste (Tabelle/Karten)
- `/devices/:id` → Detail (als Drawer über der Liste oder eigene Route auf Mobile)
- `/import` → CSV-Import-Wizard
- `/login` / `/403` → Auth-Hinweise

Auth-Guard-Loader: Bei 401 Redirect auf `/api/auth/login`.

### Responsive (drei Modi)

- **PC/Tablet (≥ 768px):** antd `Table` mit Sortierung, Spaltenfiltern, Suche; Layout mit
  einklappbarer `Sider`. Gerätedetail als `Drawer`.
- **Smartphone (< 768px):** Umschalten auf **Karten-Liste** (`List` + `Card`) mit Kernfeldern
  (Rufname, ISSI, Update-Stand-Badge, Standort); Tap öffnet Detail/Edit-`Drawer`. Navigation als
  `Drawer` statt Sider. Eingaben in `Form` mit großzügigen Touch-Targets.

Breakpoint-Erkennung via antd `Grid.useBreakpoint()`.

### Theme (Dark/Light)

- antd `ConfigProvider` mit `theme.darkAlgorithm` / `defaultAlgorithm`.
- Umschalter in der Topbar; initial aus `localStorage`, Fallback `prefers-color-scheme`.

### State

- **Server-State:** TanStack Query (Queries für Liste/Detail/Suggestions, Mutations mit
  Invalidierung). Optimistische Updates beim Bearbeiten.
- **UI-State:** lokal (Theme, Drawer offen, Mapping-Schritt). Kein Redux.

### Comboboxen

antd `AutoComplete`/`Select showSearch`, Datenquelle `useSuggestions(field)` (debounced Query
auf `/api/suggestions`), mit „neuen Wert anlegen"-Option.

---

## 9. Dashboard

- Kennzahlen: Gesamtzahl Geräte, davon `aktuell` / `veraltet` / `unbekannt` (aus berechnetem
  Update-Stand), als `Statistic`-Cards mit farbigen Badges.
- Liste „veraltete Geräte" als Schnellzugriff (Klick → gefilterte Geräteliste).
- Optional: kleine Verteilung nach Standort/Status.

---

## 10. Tests (vitest)

- **`shared/` (Kern, höchste Priorität):**
  - `computeUpdateStatus` (aktuell/veraltet/unbekannt, leere Version, gleiche createdAt-Edgecase;
    **Referenzversion ignoriert nicht zugewiesene Phantom-Versionen**).
  - `mapGroupsToRole` (admin gewinnt, kein Match → kein Zugriff, env-Override).
  - `filterEditableFields` (updater nur Allowlist `softwareVersion`/`lastUpdatedAt`/`status`,
    admin alle; gesperrte Felder werden verworfen, nicht abgelehnt).
  - `classifyImportRow` / `diffDevice` (created/updated/unchanged/error, leere ISSI, Datei-Dups).
  - CSV-Encoding/Delimiter-Hilfen (cp1252-Sample, `;`-Trenner, BOM).
- **`server/`:** Hono-Routen mit Test-Client – Auth-Guard (401/403), Rollenschranken (updater darf
  nicht löschen/anlegen), Device-CRUD, Import-Commit (dryRun + real, Rollen-Verhalten).
- E2E (Playwright): **nicht in v1.**

---

## 11. Docker & CI

### Dockerfile (Multi-Stage, ein Image)

1. **deps:** `pnpm install` (alle Workspaces).
2. **build:** `shared` → `client` (Vite-Build) → `server` (tsc/tsup).
3. **runtime:** schlankes Node-Image; kopiert `server`-Build + `client/dist` (vom Server statisch
   serviert) + Node-`prod`-deps. better-sqlite3 wird im Runtime-Image kompatibel installiert.
   SQLite-Datei liegt unter einem Volume-Pfad (`DATABASE_PATH`). Migrationen laufen beim Start
   (`drizzle-kit migrate` bzw. programmatisch) vor dem Serverstart.

`docker-compose.yml` für lokal: ein Service, Volume für `data.sqlite`, Env-Datei.

### GitHub Actions (`.github/workflows/ci.yml`)

- **Bei PR/Push:** Install → Lint → Typecheck → `vitest run`.
- **Bei Push auf `main` / Tag:** zusätzlich Docker-Build (Buildx) und Push nach **GHCR**
  (`ghcr.io/<owner>/radio-admin:latest` + `:<sha>`/`:<tag>`). Login via `GITHUB_TOKEN`.

---

## 12. Env-Variablen (Referenz)

| Variable | Pflicht | Default | Zweck |
|---|---|---|---|
| `DATABASE_PATH` | ja | `./data/data.sqlite` | SQLite-Datei |
| `SESSION_SECRET` | ja (Prod) | – | Signatur des Session-JWT |
| `OIDC_ISSUER` | ja (Prod) | – | PocketID Issuer-URL |
| `OIDC_CLIENT_ID` | ja (Prod) | – | |
| `OIDC_CLIENT_SECRET` | ja (Prod) | – | |
| `OIDC_REDIRECT_URI` | ja (Prod) | – | `…/api/auth/callback` |
| `OIDC_ADMIN_GROUP` | nein | `admin` | Gruppe → Rolle admin |
| `OIDC_UPDATER_GROUP` | nein | `personal` | Gruppe → Rolle updater |
| `AUTH_DEV_BYPASS` | nein | `false` | Auth lokal überspringen |
| `DEV_USER_ROLE` | nein | `admin` | Rolle des Fake-Users im Bypass |
| `DEV_USER_NAME` | nein | `Dev User` | Name des Fake-Users |
| `PORT` | nein | `3000` | |

---

## 13. Offene Punkte / Annahmen

- **Annahme:** „Update-Stand" wird **nicht** gespeichert, sondern berechnet aus „zuletzt
  angelegte, **mindestens einem Gerät zugewiesene** Softwareversion vs. Geräteversion". (Vom
  Nutzer bestätigt: „zuletzt verwendete … + einem Gerät zugewiesen".)
- **Annahme:** updater darf per CSV nur **aktualisieren**, keine neuen Geräte anlegen
  (Konsequenz aus „Rolle macht ausschließlich Updates"). Bei Bedarf umstellbar.
- **Annahme:** Die zuletzt angelegte, einem Gerät zugewiesene Softwareversion ist automatisch die
  Zielversion (keine manuelle Ziel-Definition in v1). Eine angelegte, aber keinem Gerät
  zugewiesene Version verschiebt die Zielversion nicht.
