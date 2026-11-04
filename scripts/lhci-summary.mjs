// Markdown summary of a Lighthouse CI run for $GITHUB_STEP_SUMMARY (I077):
//   node scripts/lhci-summary.mjs [reportDir=lhci-report] [linksFile=.lighthouseci/links.json]
// One row per page: category scores, LCP, TBT, CLS and the installable-manifest audit, plus the
// temporary-public-storage report link when the upload step produced one.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'lhci-report';
const linksFile = process.argv[3] ?? '.lighthouseci/links.json';
const manifestPath = join(dir, 'manifest.json');
if (!existsSync(manifestPath)) {
  console.log('### Lighthouse\n\nNo Lighthouse results (the collect step failed).');
  process.exit(0);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const links = existsSync(linksFile) ? JSON.parse(readFileSync(linksFile, 'utf8')) : {};
const pct = (s) => (typeof s === 'number' ? String(Math.round(s * 100)) : '–');
const ms = (a) => (a ? `${Math.round(a.numericValue)} ms` : '–');
// Three runs per page: the summary shows the representative (median) run of each.
const rows = manifest
  .filter((run) => run.isRepresentativeRun)
  .map((run) => {
    const r = JSON.parse(readFileSync(run.jsonPath, 'utf8'));
    const a = r.audits;
    const s = run.summary;
    const page = new URL(run.url).hash || '#/';
    const link = links[run.url] ? ` ([report](${links[run.url]}))` : '';
    const cls = a['cumulative-layout-shift']?.numericValue;
    const installable = a['installable-manifest']?.score === 1 ? 'pass' : 'fail';
    return `| \`${page}\`${link} | ${pct(s.performance)} | ${pct(s.accessibility)} | ${pct(s['best-practices'])} | ${pct(s.pwa)} | ${ms(a['largest-contentful-paint'])} | ${ms(a['total-blocking-time'])} | ${cls === undefined ? '–' : cls.toFixed(3)} | ${installable} |`;
  });
console.log(
  [
    '### Lighthouse (mobile, Moto G Power, 4x CPU)',
    '',
    'Budgets (lighthouserc.json): performance ≥ 85, accessibility ≥ 95, best practices ≥ 90, LCP ≤ 2.5 s (the lesson page ≤ 4 s for now: it waits for the lazy lesson bundle), TBT ≤ 300 ms, CLS ≤ 0.05 (warning), installable manifest.',
    '',
    '| Page | Perf | A11y | Best practices | PWA | LCP | TBT | CLS | Installable |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows,
  ].join('\n'),
);
