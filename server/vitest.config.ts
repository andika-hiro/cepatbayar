import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';
import path from 'node:path';

// Loaded here (rather than only in tests/setup.ts) because Vitest/Vite transpiles
// test files as ESM and hoists static `import` statements above other top-level
// code — so a dotenv.config() call inside setup.ts would run *after* src/db/client.ts
// has already read process.env to build its connection pool. Loading the env file
// during config resolution guarantees it's populated before any test file loads.
dotenv.config({ path: path.resolve(__dirname, '.env.test') });

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    fileParallelism: false,
  },
});
