// Review-only Vitest config for the Federal BRT golden dataset checks.
// Plain object (no vitest import) so it loads from this directory.
// Run from the repository root:
//   pnpm exec vitest run --config docs/review/golden/vitest.golden.config.ts
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

export default {
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  test: { environment: 'node', include: [`${here}*.golden.test.ts`], reporters: ['verbose'], testTimeout: 120000 },
};
