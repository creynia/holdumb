// Turns the visual suite's JSON report (visual-report.json) into a Markdown table of failed
// snapshots for $GITHUB_STEP_SUMMARY and the sticky PR comment.
// Usage: node scripts/visual-summary.mjs [report.json] [artifact-url]
import { readFileSync } from 'node:fs';

const [file = 'visual-report.json', artifactUrl = ''] = process.argv.slice(2);

let report;
try {
  report = JSON.parse(readFileSync(file, 'utf8'));
} catch {
  console.log(`### Visual comparison\n\nNo report at \`${file}\`: the suite did not run.`);
  process.exit(0);
}

// Strip ANSI colour codes from Playwright's error text.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const plain = (s) => String(s ?? '').replace(ANSI, '');
const rows = [];
const walk = (suite, titles) => {
  for (const s of suite.suites ?? []) walk(s, [...titles, s.title].filter(Boolean));
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      for (const r of t.results ?? []) {
        if (r.status === 'passed' || r.status === 'skipped') continue;
        const errs = (r.errors?.length ? r.errors : [r.error]).filter(Boolean);
        const msgs = errs.map((e) => plain(e.message));
        const shots = (r.attachments ?? [])
          .map((a) => a.name.match(/^(.+)-(?:expected|actual|diff)\.png$/)?.[1])
          .filter(Boolean)
          .map((n) => `${n}.png`);
        const px = msgs.join('\n').match(/(\d+) pixels \(ratio ([\d.]+)/);
        const missing = /snapshot doesn't exist/.test(msgs.join('\n'));
        rows.push({
          project: t.projectName,
          test: [...titles.slice(1), spec.title].join(' > '),
          snapshot: [...new Set(shots)].join(', ') || '-',
          diff: missing
            ? 'no baseline'
            : px
              ? `${px[1]} px (${px[2]})`
              : (msgs[0]?.split('\n')[0]?.slice(0, 80) ?? r.status),
        });
      }
    }
  }
};
walk(report, []);

const out = ['### Visual comparison', ''];
if (rows.length === 0) {
  out.push('All snapshots match the baselines.');
} else {
  out.push(`${rows.length} failed snapshot test(s).`, '');
  out.push('| Project | Test | Snapshot | Diff pixels |', '| --- | --- | --- | --- |');
  for (const r of rows) {
    out.push(`| ${r.project} | ${r.test} | ${r.snapshot} | ${r.diff.replace(/\|/g, '\\|')} |`);
  }
  out.push('');
  if (artifactUrl) {
    out.push(
      `Expected / actual / diff images: [visual-diff artifact](${artifactUrl}) ` +
        '(open playwright-report/index.html).',
    );
  }
  out.push(
    'If the change is intended, regenerate the baselines (CONTRIBUTING.md, "Visual tests") ' +
      'and say why in the PR description.',
  );
}
console.log(out.join('\n'));
