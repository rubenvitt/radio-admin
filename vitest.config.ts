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
          include: ['src/**/*.test.ts', '*.test.ts', 'test/**/*.test.ts'],
          // The unit suite drives buildApp() directly against an in-memory db and
          // must stay API-only: opt out of SPA static serving so buildApp does not
          // try to read a (non-existent in tests) ./client/dist. static.test.ts
          // calls mountStatic() itself, so it is unaffected by this flag.
          env: { SERVE_CLIENT: 'false' },
        },
      },
      // The client project loads its own vite.config.ts so it gets the React
      // plugin + jsdom setup. A root `vitest run` then also executes client tests.
      './client',
    ],
  },
});
