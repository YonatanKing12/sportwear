#!/usr/bin/env node
// Runs Shopify Theme Check on the theme at the repo root, using .theme-check.yml.
// Usage: npm run theme:check            (the repo root)
//        node scripts/theme-check.mjs <dir>   (any other theme directory, e.g. for a quick test)
// Exits 1 when there is at least one error.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, Severity } from '@shopify/theme-check-node';
import { schemaProblems } from './schema-rules.mjs';

const THEME_DIRS = ['layout', 'templates', 'sections', 'blocks', 'snippets', 'assets', 'config', 'locales'];
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(process.argv[2] ?? repoRoot);
const configPath = path.join(repoRoot, '.theme-check.yml');

if (!THEME_DIRS.some((dir) => existsSync(path.join(root, dir)))) {
  console.log(`No theme folders in ${root} yet (${THEME_DIRS.join(', ')}). Nothing to check.`);
  process.exit(0);
}

const offenses = await check(root, existsSync(configPath) ? configPath : undefined);
const label = { [Severity.ERROR]: 'error', [Severity.WARNING]: 'warning', [Severity.INFO]: 'info' };
const byFile = new Map();
for (const offense of offenses) {
  const file = path.relative(root, fileURLToPath(offense.uri));
  if (!byFile.has(file)) byFile.set(file, []);
  byFile.get(file).push(offense);
}

// Offense positions carry a character index; derive a 1-based line:column from the file text.
const position = (text, index) => {
  const before = text.slice(0, index);
  const line = before.split('\n').length;
  return `${line}:${index - before.lastIndexOf('\n')}`;
};

for (const [file, list] of [...byFile.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`\n${file}`);
  const text = existsSync(path.join(root, file)) ? readFileSync(path.join(root, file), 'utf8') : '';
  for (const o of list.sort((a, b) => a.start.index - b.start.index)) {
    console.log(
      `  ${position(text, o.start.index).padEnd(7)} ${label[o.severity].padEnd(7)}  ${o.check}  ${o.message}`,
    );
  }
}

// Upload-time schema rules that theme-check does not know (see schema-rules.mjs).
const schemaErrors = schemaProblems(root);
for (const { file, message } of schemaErrors) {
  console.log(`\n${file}\n  schema  error    ShopifyUploadRule  ${message}`);
}

const count = (severity) => offenses.filter((o) => o.severity === severity).length;
const errors = count(Severity.ERROR) + schemaErrors.length;
console.log(
  `\n${errors} error(s), ${count(Severity.WARNING)} warning(s), ${count(Severity.INFO)} info in ${byFile.size} file(s).`,
);
process.exit(errors > 0 ? 1 : 0);
