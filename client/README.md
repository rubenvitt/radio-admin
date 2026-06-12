# @ra/client

React 19 + Vite + TypeScript SPA for radio-admin. Uses antd 5, react-router 7
(data router), and TanStack Query 5. Domain types/contracts come from
`@ra/shared` (workspace dependency).

## Scripts

Run from the repo root via pnpm filter, or from inside `client/`.

| Command                              | What it does                                  |
| ------------------------------------ | --------------------------------------------- |
| `pnpm --filter @ra/client dev`       | Vite dev server (default http://localhost:5173) |
| `pnpm --filter @ra/client build`     | `tsc --noEmit` typecheck + `vite build` → `client/dist` |
| `pnpm --filter @ra/client preview`   | Serve the production build locally            |
| `pnpm --filter @ra/client test`      | Run the vitest (jsdom) suite once             |
| `pnpm --filter @ra/client test:watch`| Vitest in watch mode                          |
| `pnpm --filter @ra/client typecheck` | `tsc --noEmit -p tsconfig.json`               |

The client test project is also registered in the root `vitest.config.ts`
(`projects: [..., './client']`), so a root-level `pnpm test` / `vitest run`
executes the client suite alongside the shared/server suites.

## Running locally against the API

The Vite dev server proxies `/api/*` to `http://localhost:3000` (see
`vite.config.ts`). The intended local flow is:

1. Start the Hono server on port **3000** with auth bypass so the OIDC login
   round-trip is skipped:

   ```bash
   AUTH_DEV_BYPASS=true PORT=3000 <server start command>
   ```

   With `AUTH_DEV_BYPASS=true`, every request runs as a fixed dev user and
   `GET /api/auth/me` returns a user, so the client's `RequireAuth` guard never
   redirects to `/api/auth/login`.

2. Start the client dev server:

   ```bash
   pnpm --filter @ra/client dev
   ```

   Open http://localhost:5173 — `/api/*` requests are proxied to the server.

> [!NOTE]
> **Known gap (Phase 5A):** the `@ra/server` package does not yet expose an HTTP
> listener or a `dev`/`start` script — `server/src/index.ts` only builds the Hono
> app via `createProductionApp()`; there is no `@hono/node-server` `serve(...)`
> call. Wiring the standalone HTTP server (and a single root `dev` script that
> runs server + client together) is **Phase 6** work, which will also have Hono
> serve the built `client/dist`. Until then, substitute `<server start command>`
> above with whatever bootstrap Phase 6 adds.

## Layout for Phase 5B

Feature routes are stubbed so the app compiles and routes resolve. Replace these
placeholders when their tasks land:

- `src/pages/DashboardPage.tsx` — Dashboard (Task 5.15)
- `src/pages/DevicesPage.tsx` — DeviceList + DeviceDetailDrawer (Tasks 5.11/5.12);
  the `/devices/:id` route param drives the detail drawer
- `src/pages/ImportPage.tsx` — ImportWizard (Task 5.14)

Reusable infrastructure for 5B: `src/api/client.ts` (`apiFetch`, `apiUpload`,
`ApiError`), `src/auth/useAuth.ts`, `src/auth/RequireAuth.tsx`
(`RequireAuth`, `RequireRole`), `src/hooks/useSuggestions.ts`,
`src/hooks/useSoftwareVersions.ts`, `src/components/Combobox.tsx`,
`src/components/UpdateStatusBadge.tsx`, `src/theme/ThemeProvider.tsx`,
`src/test/utils.tsx` (`renderWithQuery`).
