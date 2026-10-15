// @vitest-environment node
// Lints a temporary bad import in each layer and expects an error, so the layering rules in
// eslint.config.js can't silently stop working (architecture.md §6.1).
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

// The files below don't exist, so the type-aware project service can't load them: lint them
// without type information and switch the type-checked rules off. Layering rules still run.
const typed = Object.fromEntries(
  tseslint.configs.recommendedTypeChecked.flatMap((c) =>
    Object.keys(c.rules ?? {}).map((r) => [r, 'off'] as const),
  ),
);
const eslint = new ESLint({
  cwd: process.cwd(),
  overrideConfig: [
    {
      languageOptions: { parserOptions: { projectService: false, project: false } },
      rules: typed,
    },
  ] as never,
});

async function violations(filePath: string, code: string): Promise<string[]> {
  const [res] = await eslint.lintText(code, { filePath });
  return (res?.messages ?? [])
    .filter((m) => m.ruleId === 'no-restricted-imports' || m.ruleId === 'no-restricted-globals')
    .map((m) => `${m.ruleId}: ${m.message}`);
}

const bad: [string, string, string][] = [
  ['engine imports math', 'src/sim/engine/__tmp.ts', "import '../math/types';"],
  ['engine imports preact', 'src/sim/engine/__tmp.ts', "import 'preact';"],
  ['engine imports the sim barrel', 'src/sim/engine/__tmp.ts', "import '..';"],
  ['engine (nested) imports strategy', 'src/sim/engine/a/__tmp.ts', "import '../../strategy';"],
  ['math imports strategy', 'src/sim/math/__tmp.ts', "import '../strategy';"],
  ['math imports app', 'src/sim/math/__tmp.ts', "import '../../app/store';"],
  ['strategy imports ui', 'src/sim/strategy/__tmp.ts', "import '../ui/Simulator';"],
  ['scene imports worker', 'src/sim/scene/__tmp.ts', "import '../worker/client';"],
  ['worker imports ui', 'src/sim/worker/__tmp.ts', "import '../ui/EvSheet';"],
  ['worker imports app', 'src/sim/worker/__tmp.ts', "import '../../app/settings';"],
  ['ui imports app', 'src/sim/ui/__tmp.ts', "import '../../app/settings';"],
  ['ui imports worker internals', 'src/sim/ui/__tmp.ts', "import '../worker/runner';"],
  ['content imports app', 'src/content/__tmp.ts', "import '../app/settings';"],
  ['content imports the worker', 'src/content/__tmp.ts', "import '../sim/worker';"],
  ['pwa imports app', 'src/pwa/__tmp.ts', "import '../app/settings';"],
  ['pwa imports sim', 'src/pwa/__tmp.ts', "import '../sim/engine';"],
  ['engine uses document', 'src/sim/engine/__tmp.ts', 'export const a = document.title;'],
  ['math uses localStorage', 'src/sim/math/__tmp.ts', 'export const a = localStorage;'],
  ['worker uses window', 'src/sim/worker/__tmp.ts', 'export const a = window;'],
];

const good: [string, string, string][] = [
  ['engine imports itself', 'src/sim/engine/__tmp.ts', "import './types';\nexport const a = 1;"],
  ['math imports engine', 'src/sim/math/__tmp.ts', "import '../engine';\nexport const a = 1;"],
  ['ui imports the worker client', 'src/sim/ui/__tmp.ts', "import '../worker/client';"],
  ['app imports the sim', 'src/app/__tmp.ts', "import '../sim';\nexport const a = 1;"],
];

describe('layering lint', () => {
  it.each(bad)('rejects: %s', async (_name, path, code) => {
    expect((await violations(path, code)).length).toBeGreaterThan(0);
  });
  it.each(good)('allows: %s', async (_name, path, code) => {
    expect(await violations(path, code)).toEqual([]);
  });
});
