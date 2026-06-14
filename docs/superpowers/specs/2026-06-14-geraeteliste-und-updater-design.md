# Design: Konfigurierbare Geräteliste & Update-Modus

**Datum:** 2026-06-14
**Status:** Freigegeben (Brainstorming abgeschlossen)
**Betrifft:** `@ra/shared`, `@ra/server`, `@ra/client`

## 1. Ziel & Kontext

Zwei zusammenhängende Verbesserungen an der Funkgeräte-Verwaltung:

1. **Geräteliste**: mehr Informationen sichtbar (Standard künftig inkl. **Funktion**), konfigurierbare Spalten und Suchfelder, ein reichhaltiges Filter-Panel hinter einem Button. Persönliche Einstellungen werden pro Browser (localStorage) gemerkt.
2. **Update-Modus**: ein schneller, mobil-optimierter Ablauf, um Geräte **einzeln, live am Gerät** als aktualisiert festzuhalten — relevant für beide Rollen (admin & updater). Inklusive einer anhängenden „Update-Anmerkung" für ISSI-Abweichungen, die bestehende Bemerkungen nicht verändert.

### Festgelegte Rahmenbedingungen

- **Kein Bulk.** „Alle Geräte auf eine neue Version setzen" ist ausdrücklich nicht gewünscht. Updates erfolgen strikt pro Gerät.
- **Kein OTA-Flashen.** Ein „Update" ist ein Datensatz-Vorgang: festhalten, dass ein Gerät jetzt auf Version X läuft (seit Datum Y).
- **Persistenz der Listen-Einstellungen:** localStorage pro Browser (gleiches Muster wie das Theme, kein Backend).
- **UI-Standard:** ausschließlich Standard-Ant-Design-v5-Komponenten, konsistent zu den bestehenden Mustern (`Grid.useBreakpoint`, `Form.useForm`, `message`, server-getriebene `Table`).
- **"auch mobile":** Es gibt im Datenmodell keine Kategorie mobil/Handfunk — der Gerätetyp steht als Freitext in `deviceType`. Keine separate Mobil-Ansicht; mobile Geräte werden über die neuen Spalten (Gerät/Funktion) und Filter besser sichtbar.

## 2. Reihenfolge (Decomposition)

Eine Spec, drei Bau-Phasen in dieser Reihenfolge (jede für sich testbar und auslieferbar):

1. **Phase A — Datenmodell**: Feld `updateNote` + Append-Endpunkt.
2. **Phase B — Liste**: konfigurierbare Spalten, Suchfelder, Filter-Panel.
3. **Phase C — Update-Modus**: die `/update`-Seite + `updateNote` im Geräte-Drawer.

Begründung der Reihenfolge: Der Update-Modus profitiert von der erweiterten Suche/Filterung (Phase B), und das Anmerkungs-Feld (Phase A) ist Voraussetzung für die ⚠-Markierung in der Liste und den Update-Modus.

## 3. Datenmodell (Phase A)

### 3.1 Neues Feld `updateNote`

- DB: neue Spalte `update_note` (text, nullable) in der `devices`-Tabelle (`server/src/db/schema.ts`).
- Migration: **append-only** per `drizzle-kit generate` aus `server/` — hängt eine neue `000N_*.sql` an und aktualisiert den `meta/`-Snapshot. Bestehende Migrationen werden **nicht** angefasst (siehe CLAUDE.md, kritische Regel).
- Zod: `updateNote: z.string().nullable().optional()` in `deviceRecordSchema`, `deviceCreateSchema`, `devicePatchSchema` (`shared/src/schemas.ts`).
- Semantik: anhängender Verlauf von Update-Meldungen. Jede angehängte Zeile hat das Format `[YYYY-MM-DD · {Name}] {Text}`. Getrennt vom Admin-Stammfeld `notes` — `notes` wird durch den Update-Vorgang nie verändert.

### 3.2 Append-Endpunkt (rollenagnostisch)

Statt `updateNote` in die `UPDATER_EDITABLE_FIELDS`-Allowlist aufzunehmen (was Replace-Semantik bedeuten würde), bekommt das Anhängen einen **dedizierten Endpunkt**. Das hält die bestehende Allowlist-Semantik sauber und erzwingt Append-only serverseitig:

- **`POST /api/devices/:id/update-note`** — Body `{ text: string (min 1) }`.
  - Für **jede** authentifizierte Rolle erlaubt (admin & updater).
  - Server liest bestehendes `updateNote`, hängt `\n[{Datum} · {Name}] {Text}` an (bzw. setzt die erste Zeile, wenn leer), schreibt via `updateDevice` zurück und legt einen `deviceEvents`-Eintrag an (neuer `source`-Wert `'update-note'`; `field='updateNote'`, `newValue` = angehängte Zeile).
  - Überschreibt nie `notes` und nie bestehende `updateNote`-Zeilen.
  - Antwort: das aktualisierte `DeviceRecord` (inkl. berechnetem `updateStatus`).
- `updateNote` bleibt zusätzlich ein **normales, admin-editierbares Feld** über `PATCH /api/devices/:id` (Replace) — Admin kann den Verlauf bei Erledigung bearbeiten/leeren. Updater bekommt `updateNote` **nicht** in `UPDATER_EDITABLE_FIELDS`, kann es also nur über den Append-Endpunkt ergänzen, nicht überschreiben.

### 3.3 „Abweichung gemeldet"-Markierung

Abgeleitet, nicht gespeichert: Flag ist `true`, wenn `updateNote` nicht leer ist. Wird in Liste und Drawer als Warn-Markierung (⚠) gezeigt. Admin „erledigt" durch Leeren/Bearbeiten des Feldes (PATCH). Ein separater „erledigt"-Haken ist v1 bewusst nicht vorgesehen (mögliche spätere Erweiterung).

## 4. Feature 1 — Liste (Phase B)

Betroffen: `client/src/features/devices/DeviceList.tsx`, `client/src/hooks/useDevices.ts`, `server/src/routes/devices.ts`, `server/src/repos/deviceRepo.ts`, plus neue kleine Komponenten in `client/src/features/devices/`.

### 4.1 Konfigurierbare Spalten

- **Spalten-Picker** als Standard-AntD `Dropdown` mit `Checkbox.Group` über alle verfügbaren Spaltenschlüssel; ausgewählte Schlüssel filtern das `columns`-Array.
- **Standard sichtbar:** OPTA/Rufname, ISSI, **Funktion**, Gerät, Update-Stand, Status, Lagerort, ⚠ (Abweichung). **Optional zuschaltbar:** Hersteller, Bedieneinheit, Gerätefunktionen, Zuordnung, OPTA, Seriennummer, Ausleihbar, Alamos, Letztes Update (softwareVersion), Zuletzt aktualisiert.
- Persistenz: localStorage-Key `ra-device-columns` (Liste sichtbarer Spaltenschlüssel). v1: nur Sichtbarkeit (keine Drag-Reihenfolge); feste, sinnvolle Spaltenreihenfolge.
- Neue ⚠-Spalte: zentriert, rendert eine Warn-Markierung (`react-icons/fi`, z. B. `FiAlertTriangle`) mit Tooltip, wenn `updateNote` vorhanden.

### 4.2 Konfigurierbare Suche

- Neben dem `Input.Search` ein **„Suchfelder"-Dropdown** (AntD `Dropdown` + `Checkbox.Group`): Nutzer wählt, in welchen Feldern gesucht wird. Persistenz: localStorage-Key `ra-device-search-fields`.
- Client sendet `searchFields` (CSV) als zusätzlichen Query-Param an `GET /api/devices`.
- **Server-Whitelist** (`deviceRepo.ts`): `SEARCHABLE_FIELDS` = Map `fieldKey → drizzle column`. Erlaubt: `rufname, issi, serialNumber, assignedTo, opta, funktion, deviceType, location, hersteller, bedieneinheit, hiorgId`. Der `OR LIKE %q%`-Block wird dynamisch nur aus den (angeforderten ∧ whitelisteten) Spalten gebaut — **Feldnamen nie roh interpolieren**, immer über die Map (gleiches Schutzmuster wie das bestehende Sort-Whitelist).
- **Standard-Suchfelder** (wenn kein `searchFields` übergeben): `rufname, issi, serialNumber, assignedTo, opta, funktion` (Erweiterung der heutigen 4 um OPTA & Funktion). Damit findet der Update-Modus Geräte zuverlässig per ISSI/Rufname/OPTA.

### 4.3 Filter-Panel hinter „▾ Filter"-Button

- AntD `Button` mit `Badge` (Anzahl aktiver Filter) öffnet einen **`Drawer`** (rechts; mobil Vollbreite). Inhalt: AntD `Form` mit:
  - **Mehrfach-Selects** (`mode="multiple"`, `IN`-Semantik): Gerät (`deviceType`), Funktion (`funktion`), Status (`status`), Lagerort (`location`), Hersteller (`hersteller`).
  - **Update-Stand** (`updateStatus`): Select (aktuell/veraltet/unbekannt).
  - **Gerätefunktionen** (`deviceModes`): Select über `DEVICE_MODES` (TMO/DMO/REP/GAT), Semantik „enthält Token".
  - **Schalter** (boolean): Ausleihbar (`loanable`), Alamos (`alamosIntegrated`), **Abweichung gemeldet** (`hasUpdateNote`).
  - Buttons „Anwenden" / „Zurücksetzen".
- **Optionsquellen:** die kategorialen Selects beziehen ihre Werte aus dem bestehenden `GET /api/suggestions?field=<f>` (Envelope `{ values: [] }`) — verfügbar für `deviceType, funktion, status, location, hersteller`. `deviceModes` aus der Konstante `DEVICE_MODES`. `updateStatus` aus den fixen drei Werten.
- **Server (`deviceRepo.listDevices`)**: pro Filter ein Query-Param + Where-Klausel, **whitelist-getrieben**:
  - kategorial multi: `inArray(column, values)` für `deviceType, funktion, status, location, hersteller`.
  - `updateStatus`: bestehende `statusExpr`-CASE-Logik (unverändert).
  - `deviceModes`: `LIKE %TOKEN%` je gewähltem Token (mehrere Tokens → `AND`).
  - boolean: `eq(column, 1)` für `loanable`, `alamosIntegrated`; `hasUpdateNote` → `update_note IS NOT NULL AND update_note != ''`.
- **Deep-Linking:** aktive Filter spiegeln sich wie heute in die URL-Query (`DevicesPage` seedet `initialParams` aus `useSearchParams`, Remount-Trick über `key=` bleibt). Dashboard-Quicklinks funktionieren weiter.
- Bestehende, immer sichtbare Steuerelemente (Suche, Update-Stand-Schnellfilter) bleiben; das Panel ergänzt die selteneren Filter „hinter dem Button".

### 4.4 Mobile Karten

`DeviceList`-Kartenansicht (< `md`) zeigt künftig zusätzlich **Funktion**, **Gerät** und die ⚠-Markierung. Suche, Suchfelder-Auswahl und Filter-Drawer identisch zur Desktop-Variante.

### 4.5 Persistenz-Hilfsmittel

Kleiner generischer Hook `usePersistentState<T>(key, fallback)` (liest/schreibt localStorage, JSON-serialisiert) in `client/src/hooks/`. Genutzt für `ra-device-columns` und `ra-device-search-fields`. Defensiv gegen ungültige/alte Werte (fällt auf `fallback` zurück).

## 5. Feature 2 — Update-Modus (Phase C)

Neue Route **`/update`** unter dem `RequireAuth`-Layout (beide Rollen, neuer Nav-Eintrag in `AppLayout.tsx`, **nicht** `adminOnly`). Komponenten in neuem Ordner `client/src/features/update/`. Mobil-optimiert (`Grid.useBreakpoint`).

### 5.1 Ablauf

1. **Zielversion wählen** (einmal pro Session): `Combobox` (`allowCreate`) befüllt aus `GET /api/software-versions`. Auswahl im Komponenten-State (optional zusätzlich localStorage `ra-update-target`, damit ein Tagewechsel nicht nervt). Die Zielversion ist bewusst eine explizite Auswahl.
2. **Gerät suchen**: `Input.Search` → `GET /api/devices?q=…&searchFields=issi,rufname,opta&pageSize=…`. Treffer als Liste/Karten (AntD `List`/`Card`). Anzeige je Treffer: Rufname/OPTA, ISSI, Funktion, Gerät, aktueller Update-Stand-Badge.
3. **Ein Tap „✓ Auf {Zielversion} aktualisiert"**: `PATCH /api/devices/:id` mit `{ softwareVersion: target, lastUpdatedAt: <heute, epoch ms> }` (optional Status). Nutzt den vorhandenen Single-PATCH; `filterEditableFields` lässt für beide Rollen genau diese Felder durch. Erfolgsmeldung via `message.success`; Karte aktualisiert Badge auf „aktuell".
4. **„⚠ ISSI weicht ab / Anmerkung"** (Ausklapper): Textfeld → `POST /api/devices/:id/update-note`. Hängt an `updateNote` an (Datum + Name), `notes` bleibt unberührt.
5. **Fortschritt** „X von Y auf Zielversion": Y = Gesamtzahl Geräte (`GET /api/devices?pageSize=1` → `total`), X = `GET /api/devices?updateStatus=aktuell&pageSize=1` → `total`. (Sobald die Zielversion auf das erste Gerät gesetzt ist, wird sie zur Referenzversion, daher entspricht „aktuell" den Geräten auf der Zielversion.) Kleine `Statistic`/`Progress`-Anzeige.

### 5.2 Reference-Version-Effekt (bewusst)

`getReferenceVersion` = neueste Version, die ≥1 Gerät zugewiesen ist. Sobald im Rollout das erste Gerät auf die neue Zielversion gesetzt wird, springen alle übrigen automatisch auf „veraltet". Das ist im Rollout-Kontext gewollt und wird als Fortschritt visualisiert — nicht als Fehler.

### 5.3 Geräte-Drawer

`DeviceDetailDrawer`/`DeviceFields` bekommen das `updateNote`-Feld:
- **Admin:** editierbares Textfeld (Replace via PATCH) — zum Bearbeiten/Leeren (Erledigen).
- **Andere Rollen:** read-only Anzeige des Verlaufs + ein „Anmerkung hinzufügen"-Eingabefeld, das den Append-Endpunkt nutzt.
- ⚠-Hinweis im Drawer-Kopf, wenn `updateNote` vorhanden.

## 6. Rollen & Sicherheit

- `filterEditableFields(role, patch)` bleibt **die** Autorisierungsgrenze für Feld-Updates (Single-PATCH/CSV-Import), unverändert. Updater darf weiterhin nur `softwareVersion, lastUpdatedAt, status` per PATCH setzen.
- Der Append-Endpunkt ist die einzige Stelle, an der ein Updater `updateNote` ergänzt — und zwar ausschließlich anhängend, serverseitig erzwungen (kein Vertrauen in den Client).
- Keine neuen Route-Guards für PATCH (Allowlist ist die Grenze). Der Append-Endpunkt erlaubt jede authentifizierte Rolle.
- Client-seitiges Rollen-Gating (`lockedFor`, `useAuth`) wird für das neue Feld konsistent ergänzt (Defense-in-depth, nicht die Grenze).

## 7. Tests (TDD pro Phase)

- **shared:** Zod-Schemas für `updateNote`; ggf. Append-Formatierungs-Helfer als reine Funktion (`shared/`), unit-getestet.
- **server (`app.request` + `authCookie`):**
  - `POST /api/devices/:id/update-note` als admin **und** updater → hängt an, überschreibt `notes` nicht, legt `deviceEvents`-Eintrag an; leerer Text → 400; unbekannte ID → 404.
  - `listDevices`: neue Filter (inArray, boolean, hasUpdateNote, deviceModes-LIKE) und konfigurierbare Suche (nur whitelistete Felder; unbekannte Felder ignoriert, nie interpoliert).
  - Updater-PATCH mit `updateNote` im Body → Feld wird verworfen (nicht in Allowlist).
- **client (`global.fetch`-Mock, `renderWithQuery`, `MemoryRouter`):**
  - Spalten-Picker zeigt/versteckt Spalten; localStorage-Persistenz.
  - Suchfelder-Auswahl steuert den `searchFields`-Param.
  - Filter-Drawer setzt Query-Params; Badge zählt aktive Filter.
  - Update-Modus: Zielversion + Suche → „Aktualisiert"-Button löst korrekten PATCH aus; Anmerkung löst Append-Call aus.

## 8. Bewusst nicht im Scope (YAGNI)

- Kein Bulk-Update-Endpunkt / keine Mehrfachauswahl in der Liste.
- Kein OTA-Flashen.
- Keine server-seitige, geräteübergreifende Persistenz der Listen-Einstellungen (localStorage genügt).
- Keine Drag-&-Drop-Spaltenreihenfolge (nur Sichtbarkeit).
- Kein separater „erledigt"-Haken für Abweichungen (Admin leert das Feld).

## 9. Betroffene Dateien (Überblick)

**shared:** `src/schemas.ts`, `src/editable-fields.ts` (unverändert in der Allowlist — bewusst), evtl. neuer Append-Helfer.
**server:** `src/db/schema.ts` (+ neue Migration `000N_*.sql` + `meta/`), `src/routes/devices.ts` (neuer Append-Endpunkt, Filter-Params), `src/repos/deviceRepo.ts` (`SEARCHABLE_FIELDS`, neue Where-Klauseln), `src/repos/deviceRepo.ts`-`writeEvents`-Pfad (`source='update-note'`).
**client:** `src/hooks/usePersistentState.ts` (neu), `src/hooks/useDevices.ts` (`searchFields` + neue Filter im Query-String), `src/features/devices/DeviceList.tsx` (Picker, Suchfelder, Filter-Drawer, ⚠-Spalte, Karten), `src/features/devices/DeviceFields.tsx` & `DeviceDetailDrawer.tsx` (`updateNote`), neue `src/features/update/*` + Route in `src/routes/router.tsx` + Nav in `src/layout/AppLayout.tsx`, neuer Hook `src/hooks/useUpdateNote.ts`.
