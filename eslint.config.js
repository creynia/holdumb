import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

// ---- Layering (docs/design/architecture.md §6.1, decisions.md) --------------------------------
//   engine <- nothing; math <- engine; strategy <- engine, math; scene <- engine, math, strategy;
//   worker <- engine, math, strategy; ui <- everything under sim; content <- sim; pwa <- nothing.
// Rules cover alias-style imports (globs) AND relative imports. For a file at depth d below its
// layer directory, '../' x d is the layer root, '../' x (d+1) is src/sim, '../' x (d+2) is src.
// One config block per (layer, depth) so a relative import can never slip through by being deeper.

const MAX_DEPTH = 4;
const SIM_LAYERS = ['engine', 'math', 'strategy', 'scene', 'worker', 'ui'];
const ALLOWED = {
  engine: [],
  math: ['engine'],
  strategy: ['engine', 'math'],
  scene: ['engine', 'math', 'strategy'],
  worker: ['engine', 'math', 'strategy'],
  ui: ['engine', 'math', 'strategy', 'scene', 'worker'],
};
const NO_DOM = ['document', 'window', 'localStorage', 'sessionStorage', 'navigator'];
const PURE_GLOBALS = [
  ...NO_DOM,
  'requestAnimationFrame',
  'self',
  'location',
  'fetch',
  'postMessage',
];
const WORKER_GLOBALS = ['document', 'window', 'localStorage', 'sessionStorage'];

const noGlobals = (names, why) =>
  names.map((name) => ({ name, message: `${why} must not use ${name}.` }));

function layerRules(layer, depth) {
  const up = (n) => '../'.repeat(n);
  const sibling = up(depth + 1); // src/sim/
  const src = up(depth + 2); // src/
  const allowedSiblings = ALLOWED[layer].flatMap((l) => [`!${sibling}${l}`, `!${sibling}${l}/**`]);
  const group = [
    // Anything outside src/sim (src/app, src/content, src/pwa, the repo root, ...).
    `${src}**`,
    // Sibling sim layers and the sim barrel, except the allowed lower layers.
    `${sibling}*`,
    `${sibling}**`,
    ...allowedSiblings,
  ];
  if (layer === 'ui') {
    // ui talks to the worker through its public surface only (EvClient + protocol types).
    group.push(
      `${sibling}worker/*`,
      `${sibling}worker/**`,
      `!${sibling}worker/index`,
      `!${sibling}worker/client`,
      `!${sibling}worker/protocol`,
      '**/sim/worker/*',
      '!**/sim/worker/index',
      '!**/sim/worker/client',
      '!**/sim/worker/protocol',
    );
  }
  const aliasGroup = [
    '**/app/**',
    '**/content/**',
    '**/pwa/**',
    '**/sim/index',
    ...SIM_LAYERS.filter((l) => l !== layer && !ALLOWED[layer].includes(l)).map(
      (l) => `**/sim/${l}/**`,
    ),
  ];
  const bare =
    layer === 'worker'
      ? []
      : layer === 'ui'
        ? ['\\#ev-worker']
        : ['preact', 'preact/*', '\\#ev-worker'];
  return {
    files: [`src/sim/${layer}/${'*/'.repeat(depth)}*.{ts,tsx}`],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          // Exact specifiers: the src/sim barrel reached as '..' / '../..' (globs can't express it).
          paths: [up(depth + 1).slice(0, -1), up(depth + 1), `${sibling}index`].map((name) => ({
            name,
            message: `src/sim/${layer} must not import the src/sim barrel.`,
          })),
          patterns: [
            {
              group: [...group, ...aliasGroup, ...bare],
              message: `src/sim/${layer} may import only ${
                ALLOWED[layer].length ? ALLOWED[layer].join(', ') + ' and itself' : 'itself'
              } (architecture.md §6.1).`,
            },
          ],
        },
      ],
    },
  };
}

const layeringBlocks = [];
for (const layer of SIM_LAYERS) {
  if (layer === 'ui') continue; // ui imports every sim layer; only app/content/pwa are off limits
  for (let depth = 0; depth <= MAX_DEPTH; depth++) layeringBlocks.push(layerRules(layer, depth));
}
// ui may import all lower sim layers but nothing from app/content/pwa.
for (let depth = 0; depth <= MAX_DEPTH; depth++) layeringBlocks.push(layerRules('ui', depth));

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-single/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'public/icons/**',
      'src/sim/math/tables/**',
      'node_modules/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{mjs,js}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['*.config.ts', 'build/**/*.ts'],
    extends: [...tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.node } },
  },
  ...layeringBlocks,
  // No DOM in the pure modules; the worker may use self/postMessage but not the page's globals.
  {
    files: ['src/sim/{engine,math,strategy,scene}/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts'],
    rules: { 'no-restricted-globals': ['error', ...noGlobals(PURE_GLOBALS, 'Pure sim modules')] },
  },
  {
    files: ['src/sim/worker/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: { 'no-restricted-globals': ['error', ...noGlobals(WORKER_GLOBALS, 'The EV worker')] },
  },
  // pwa: the service worker and its registration know nothing about the app or the sim.
  {
    files: ['src/pwa/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../app/**',
                '../app',
                '../sim/**',
                '../sim',
                '../content/**',
                '../content',
                '../../app/**',
                '../../sim/**',
                '../../content/**',
              ],
              message: 'src/pwa imports nothing app specific.',
            },
          ],
        },
      ],
    },
  },
  // content: the compiler reads the sim through its public barrel(s) only, never app or ui.
  {
    files: ['src/content/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['../sim', '../sim/index', '../sim/worker', '#ev-worker'].map((name) => ({
            name,
            message:
              'src/content uses the sim sub-barrels (engine, scene, strategy), not the root barrel or the worker.',
          })),
          patterns: [
            {
              group: [
                '../app',
                '../app/**',
                '../sim/ui',
                '../sim/ui/**',
                '../sim/worker/**',
                '../../*',
                '../../**',
              ],
              message: 'src/content imports from the sim only (types, parseCards, validateScene).',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
