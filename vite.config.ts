import { defineConfig, configDefaults } from 'vitest/config';
import { editorPlugin } from './harness/editor/vite-plugin';
import { capturePlugin } from './harness/capture/vite-plugin';
import { hotPlugin } from './harness/hot/vite-plugin';
import { assetsPlugin } from './harness/hot/assets-plugin';

// Dev serves the repo root: games at /games/<name>/, UI components at /harness/ui/.
export default defineConfig(({ mode }) => ({
  server: { port: 5173, host: true },
  plugins: [editorPlugin(), capturePlugin(), hotPlugin(), assetsPlugin()],
  test: {
    // Agent worktrees hold other branches' copies of the tests.
    exclude: [...configDefaults.exclude, '.claude/**', ...(mode === 'slow' ? [] : ['**/*.slow.test.ts'])],
    ...(mode === 'slow' ? { include: ['**/*.slow.test.ts'] } : {}),
    // `npm test` is the fast suite: a test that needs more than a few seconds is cheaper by design or is a `*.slow.test.ts`
    // (`npm run test:slow`, mode `slow`: wide seed sweeps, whole days at the live frame rate).
    testTimeout: mode === 'slow' ? 120_000 : 20_000,
    setupFiles: ['./harness/testsetup.ts'],
    // Files share a worker and its module state (starting a worker per file is a third of the run): a test that changes module state puts it back.
    pool: 'threads',
    isolate: false,
  },
}));
