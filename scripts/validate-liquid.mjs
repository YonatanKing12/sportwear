#!/usr/bin/env node
// Runs Shopify's official Liquid validator (vendored in .claude/skills/shopify) on theme files.
// Usage: npm run theme:validate                      (every .liquid file in the theme)
//        npm run theme:validate -- sections/a.liquid snippets/b.liquid
// Telemetry stays off (OPT_OUT_INSTRUMENTATION). Exits 1 when any file has an error.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const validator = path.join(repoRoot, '.claude/skills/shopify/scripts/validate.mjs');
const THEME_DIRS = ['layout', 'templates', 'sections', 'blocks', 'snippets'];

let files = process.argv.slice(2).map((f) => path.relative(repoRoot, path.resolve(f)));
if (!files.length) {
  files = THEME_DIRS.flatMap((dir) =>
    existsSync(path.join(repoRoot, dir))
      ? readdirSync(path.join(repoRoot, dir))
          .filter((f) => f.endsWith('.liquid'))
          .map((f) => `${dir}/${f}`)
      : [],
  );
}
files = files.filter((f) => f.endsWith('.liquid'));
if (!files.length) {
  console.log('No Liquid files to validate.');
  process.exit(0);
}

if (!existsSync(path.join(repoRoot, '.claude/skills/shopify/node_modules'))) {
  console.error('Validator dependencies missing. Run: npm install --include=dev --prefix .claude/skills/shopify');
  process.exit(2);
}

let failed = 0;
const BATCH = 25;
for (let i = 0; i < files.length; i += BATCH) {
  const batch = files.slice(i, i + BATCH);
  const run = spawnSync(
    process.execPath,
    ['--no-deprecation', validator, '--api', 'liquid', '--theme-path', repoRoot, '--files', batch.join(',')],
    { cwd: repoRoot, encoding: 'utf8', env: { ...process.env, OPT_OUT_INSTRUMENTATION: 'true', DO_NOT_TRACK: '1' } },
  );
  const output = `${run.stdout}\n${run.stderr}`;
  // Keep only the per-file verdicts and findings.
  for (const line of output.split('\n')) {
    if (/^\*\*Details:\*\*|^(ERROR|WARNING|INFO)\b|^- /.test(line.trim()))
      console.log(line.replace('**Details:** ', '  '));
  }
  if (/FAILED|INVALID\*\*/.test(output) && !/Overall Status:\*\* ⚠️ VALID|Overall Status:\*\* ✅ VALID/.test(output))
    failed += 1;
  if (run.status !== 0 && !/Overall Status/.test(output)) {
    console.error(output);
    failed += 1;
  }
}
console.log(failed ? `\n✗ Validation failed.` : `\n✓ ${files.length} file(s) valid.`);
process.exit(failed ? 1 : 0);
