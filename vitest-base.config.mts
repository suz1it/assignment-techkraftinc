import { defineConfig } from 'vitest/config';

// Loaded by the Angular unit-test builder via `runnerConfig` in angular.json.
// Angular configures the test environment itself; this file only adds coverage settings.
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'lcov'],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 75,
        // Auth, interceptors, validators and drafts carry the assignment's core logic.
        'src/app/core/**': { lines: 90, statements: 90, functions: 90, branches: 85 },
      },
    },
  },
});
