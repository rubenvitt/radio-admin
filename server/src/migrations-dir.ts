import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Resolve the committed drizzle migrations folder robustly across layouts.
 *
 * The `import.meta.url`-relative path differs between source and the tsup bundle:
 *   - source `server/src/db/index.ts`  -> `../../drizzle`  (= server/drizzle)
 *   - source `server/src/migrate.ts`   -> `../drizzle`     (= server/drizzle)
 *   - bundled `server/dist/*.js`       -> `../drizzle`     (= server/drizzle)
 * and in the Docker image we copy migrations to `/app/server/drizzle`.
 *
 * Precedence:
 *   1. `MIGRATIONS_DIR` env (explicit override, used by Docker).
 *   2. The first existing candidate among the module-relative paths above.
 *   3. As a last resort the bundle-relative default, so the caller still gets a
 *      deterministic path (the drizzle migrator then surfaces a clear error).
 */
export function resolveMigrationsDir(moduleUrl: string): string {
  const envDir = process.env.MIGRATIONS_DIR;
  if (envDir && envDir.trim() !== '') {
    return resolve(envDir);
  }

  const moduleDir = dirname(fileURLToPath(moduleUrl));
  const bundleRelative = resolve(moduleDir, '../drizzle'); // dist/*.js or src/migrate.ts -> server/drizzle
  const srcDbRelative = resolve(moduleDir, '../../drizzle'); // src/db/index.ts -> server/drizzle
  for (const candidate of [bundleRelative, srcDbRelative]) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return bundleRelative;
}
