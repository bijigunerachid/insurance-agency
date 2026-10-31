import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.js'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.js'],
          environment: 'node',
          setupFiles: ['test/integration/setup.js'],
          globalSetup: ['test/integration/globalSetup.js'],
          // Argon2 hashing makes these tests slower than unit tests.
          testTimeout: 20_000,
          // One real database: run files one after another.
          fileParallelism: false,
        },
      },
    ],
  },
});
