import { defineConfig } from 'vitest/config';
// `fake-indexeddb/auto` gives the node environment a real IndexedDB implementation, so the Dexie repository and the database
// upgrades run in `pnpm test`. It must load before Dexie, which reads the global at import time.
export default defineConfig({ test: { environment: 'node', include: ['src/**/*.test.ts'], setupFiles: ['fake-indexeddb/auto'] } });
