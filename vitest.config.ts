import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { contentPlugin } from './build/vite-plugin-content.ts';

const shared = {
  plugins: [preact(), contentPlugin()],
  define: {
    __SINGLE_FILE__: false,
    __APP_VERSION__: JSON.stringify('test'),
    __BUILD_SHA__: JSON.stringify('test'),
  },
  resolve: {
    alias: {
      '#ev-worker': fileURLToPath(
        new URL('./src/sim/worker/transport-inthread.ts', import.meta.url),
      ),
    },
  },
};
const exclude = ['tests/e2e/**', 'node_modules/**'];
// Anything that renders needs a DOM; everything else (engine, math, strategy, content) runs in node.
const domGlobs = [
  '**/*.test.tsx',
  'src/app/**/*.test.{ts,tsx}',
  'src/sim/ui/**/*.test.{ts,tsx}',
  'tests/app/**/*.test.{ts,tsx}',
  'tests/sim-ui/**/*.test.{ts,tsx}',
];

export default defineConfig({
  test: {
    projects: [
      {
        ...shared,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
          exclude: [...exclude, ...domGlobs],
        },
      },
      {
        ...shared,
        test: {
          name: 'dom',
          environment: 'happy-dom',
          include: domGlobs,
          exclude,
        },
      },
    ],
  },
});
