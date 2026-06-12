# radio-admin

Administration tool for managing radio devices (Funkgeräte): device inventory,
software-version tracking, CSV import, and an OIDC-secured admin UI. A pnpm
monorepo with three packages:

- `@ra/shared` — shared Zod schemas, types, and domain logic.
- `@ra/server` — Hono API + SQLite (better-sqlite3 / drizzle), serves the SPA.
- `@ra/client` — React + Vite single-page app.

The production build is a **single all-in-one image**: the server runs DB
migrations on start, then serves `/api/*` and the built SPA from one origin on
port 3000.

## Local development

```bash
pnpm install
pnpm dev
```

`pnpm dev` runs the server (with `AUTH_DEV_BYPASS=true`, so login is skipped and
every request is the dev admin user) and the Vite dev server together. Vite
proxies `/api` to the server, so the SPA and API share an origin in dev too.
The client is at http://localhost:5173, the API at http://localhost:3000.

### Workspace scripts

| Script           | What it does                                             |
| ---------------- | -------------------------------------------------------- |
| `pnpm dev`       | Server (dev bypass, tsx watch) + client Vite together.   |
| `pnpm build`     | Build order: `@ra/shared` → `@ra/client` → `@ra/server`. |
| `pnpm start`     | Run the built server (`node server/dist/index.js`).      |
| `pnpm lint`      | ESLint across the workspace.                             |
| `pnpm typecheck` | `tsc --noEmit` in every package.                         |
| `pnpm test`      | Run the whole vitest suite once.                         |

## Docker / Deployment

Build and run locally:

```bash
cp .env.example .env   # fill in OIDC + SESSION_SECRET for real auth
docker compose up --build
```

The single image runs DB migrations on start, then serves the API and the SPA on
port 3000. SQLite persists in the `radio-data` volume at `/data/data.sqlite`.

### Configuration

All configuration is via environment variables (see `.env.example`):

| Variable             | Purpose                                                         |
| -------------------- | --------------------------------------------------------------- |
| `DATABASE_PATH`      | SQLite file path (Docker: `/data/data.sqlite`, on the volume).  |
| `SESSION_SECRET`     | Cookie-signing secret, ≥16 chars (required unless dev bypass).  |
| `OIDC_ISSUER`        | OIDC provider issuer URL (required unless dev bypass).          |
| `OIDC_CLIENT_ID`     | OIDC client id (required unless dev bypass).                    |
| `OIDC_CLIENT_SECRET` | OIDC client secret (required unless dev bypass).                |
| `OIDC_REDIRECT_URI`  | OIDC callback URL (`.../api/auth/callback`).                    |
| `OIDC_ADMIN_GROUP`   | Group claim mapped to the `admin` role (default `admin`).       |
| `OIDC_UPDATER_GROUP` | Group claim mapped to the `updater` role (default `personal`).  |
| `AUTH_DEV_BYPASS`    | **Must stay `false` in prod.** Disables auth; runs as dev user. |
| `DEV_USER_ROLE`      | Role for the dev-bypass user (`admin`\|`updater`).              |
| `DEV_USER_NAME`      | Display name for the dev-bypass user.                           |
| `PORT`               | HTTP listen port (default `3000`).                              |
| `STATIC_DIR`         | Built SPA directory (image: `/app/client/dist`).                |
| `MIGRATIONS_DIR`     | Drizzle migrations directory (image: `/app/server/drizzle`).    |

### Smoke test (manual)

```bash
docker build -t radio-admin:dev .
./scripts/smoke.sh radio-admin:dev   # checks GET / (HTML 200) and GET /api/auth/me (JSON 200)
```

### CI / images

On push to `main` (or a `vX` tag) GitHub Actions runs lint + typecheck + vitest,
builds the image with Buildx, smoke-tests it, and pushes to
`ghcr.io/<owner>/radio-admin` (`:latest`, `:sha-<sha>`, and `:<tag>`).
