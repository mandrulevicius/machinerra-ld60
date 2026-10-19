import { readdirSync } from 'node:fs';
import { basename } from 'node:path';
import { defineConfig, configDefaults } from 'vitest/config';
import { editorPlugin } from './harness/editor/vite-plugin';
import { capturePlugin } from './harness/capture/vite-plugin';
import { hotPlugin } from './harness/hot/vite-plugin';
import { assetsPlugin } from './harness/hot/assets-plugin';

// Dev serves the repo root: games at /games/<name>/, UI components at /harness/ui/.
export default defineConfig(({ mode }) => ({
  // Agents' worktrees hold whole copies of the repo; watching them full-reloads every open page on their edits.
  server: { port: 5173, host: true, watch: { ignored: ['**/.claude/worktrees/**'] } },
  plugins: [editorPlugin(), capturePlugin(), hotPlugin(), assetsPlugin()],
  test: {
    // One vitest project per game folder (`games/*`, not `_template`) plus `harness`, so a game's tests run alone:
    // `npm run test:game -- <name>` runs that game and the harness; `npm test` runs all of them.
    projects: ['harness', ...readdirSync('games', { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('_')).map((e) => `games/${e.name}`)].map((dir) => ({
      extends: true,
      test: {
        name: basename(dir),
        include: [`${dir}/**/*.${mode === 'slow' ? 'slow.test' : 'test'}.ts`],
        // Agent worktrees hold other branches' copies of the tests.
        exclude: [...configDefaults.exclude, '.claude/**', ...(mode === 'slow' ? [] : ['**/*.slow.test.ts'])],
      },
    })),
    // `npm test` is the fast suite: a test that needs more than a few seconds is cheaper by design or is a `*.slow.test.ts`
    // (`npm run test:slow`, mode `slow`: wide seed sweeps, whole days at the live frame rate).
    testTimeout: mode === 'slow' ? 120_000 : 20_000,
    setupFiles: ['./harness/testsetup.ts'],
    // Files share a worker and its module state (starting a worker per file is a third of the run): a test that changes module state puts it back.
    pool: 'threads',
    isolate: false,
  },
}));
