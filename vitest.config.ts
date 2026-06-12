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
        },
      },
      // The client project loads its own vite.config.ts so it gets the React
      // plugin + jsdom setup. A root `vitest run` then also executes client tests.
      './client',
    ],
  },
});
