import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/migrate.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // better-sqlite3 is a native addon and must stay external (never bundled).
  external: ['better-sqlite3'],
  // Bundle the workspace shared package (no published artifact to resolve at
  // runtime); everything else node-resolvable stays external by default.
  noExternal: ['@ra/shared'],
});
