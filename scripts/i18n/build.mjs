#!/usr/bin/env node
// Builds the theme's locale files from the translation parts in i18n/.
//
// Each area of the theme owns its own part files, so parallel work never edits the same file:
//   i18n/<area>.<lang>.json          storefront strings, lang = he | en | ar
//   i18n/<area>.schema.<lang>.json   theme editor strings, lang = en | he
// Output:
//   locales/he.default.json, locales/en.json, locales/ar.json
//   locales/en.default.schema.json, locales/he.schema.json
//
// Fails when two parts define the same key, when a key exists in one language but not in another,
// or (with --check) when the committed locale files are out of date.
// Usage: npm run i18n          (write)
//        npm run i18n:check    (verify only)
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const partsDir = path.join(repoRoot, 'i18n');
const localesDir = path.join(repoRoot, 'locales');
const checkOnly = process.argv.includes('--check');

const TARGETS = [
  { kind: 'storefront', lang: 'he', file: 'he.default.json' },
  { kind: 'storefront', lang: 'en', file: 'en.json' },
  { kind: 'storefront', lang: 'ar', file: 'ar.json' },
  { kind: 'schema', lang: 'en', file: 'en.default.schema.json' },
  { kind: 'schema', lang: 'he', file: 'he.schema.json' },
];
// CLDR plural categories. Languages need different subsets (Arabic uses all six), so objects made
// only of these keys are compared as a whole, not key by key.
const PLURAL_KEYS = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

const errors = [];
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isPluralObject = (value) =>
  isObject(value) && Object.keys(value).length > 0 && Object.keys(value).every((k) => PLURAL_KEYS.has(k));

function mergeInto(target, source, origin, owners, trail = []) {
  for (const [key, value] of Object.entries(source)) {
    const keyPath = [...trail, key].join('.');
    if (isObject(value) && !isPluralObject(value)) {
      if (key in target && !isObject(target[key])) {
        errors.push(`${origin}: "${keyPath}" is an object here but a string in ${owners.get(keyPath)}`);
        continue;
      }
      target[key] ??= {};
      mergeInto(target[key], value, origin, owners, [...trail, key]);
      continue;
    }
    if (typeof value !== 'string' && !isPluralObject(value)) {
      errors.push(`${origin}: "${keyPath}" must be a string or a plural object`);
      continue;
    }
    if (key in target) {
      errors.push(`${origin}: "${keyPath}" is already defined in ${owners.get(keyPath)}`);
      continue;
    }
    target[key] = value;
    owners.set(keyPath, origin);
  }
}

function leafPaths(object, trail = []) {
  return Object.entries(object).flatMap(([key, value]) =>
    isObject(value) && !isPluralObject(value) ? leafPaths(value, [...trail, key]) : [[...trail, key].join('.')],
  );
}

const partFiles = existsSync(partsDir)
  ? readdirSync(partsDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
  : [];
const built = new Map();

for (const target of TARGETS) {
  const suffix = target.kind === 'schema' ? `.schema.${target.lang}.json` : `.${target.lang}.json`;
  const files = partFiles.filter((f) =>
    target.kind === 'schema' ? f.endsWith(suffix) : f.endsWith(suffix) && !f.includes('.schema.'),
  );
  const merged = {};
  const owners = new Map();
  for (const file of files) {
    let content;
    try {
      content = JSON.parse(readFileSync(path.join(partsDir, file), 'utf8'));
    } catch (error) {
      errors.push(`i18n/${file}: invalid JSON (${error.message})`);
      continue;
    }
    mergeInto(merged, content, `i18n/${file}`, owners);
  }
  built.set(target.file, { ...target, data: merged, areas: files.map((f) => f.slice(0, -suffix.length)) });
}

// Every language must have exactly the same keys as the default language of its kind.
for (const kind of ['storefront', 'schema']) {
  const group = [...built.values()].filter((t) => t.kind === kind);
  const [reference, ...others] = group;
  const referenceKeys = new Set(leafPaths(reference.data));
  for (const other of others) {
    const keys = new Set(leafPaths(other.data));
    for (const key of referenceKeys) if (!keys.has(key)) errors.push(`${other.lang} (${kind}) is missing "${key}"`);
    for (const key of keys) if (!referenceKeys.has(key)) errors.push(`${other.lang} (${kind}) has extra key "${key}"`);
    const missingAreas = reference.areas.filter((a) => !other.areas.includes(a));
    for (const area of missingAreas)
      errors.push(`missing part file i18n/${area}.${kind === 'schema' ? 'schema.' : ''}${other.lang}.json`);
  }
}

if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  console.error(`\n${errors.length} i18n problem(s). Locale files were not written.`);
  process.exit(1);
}

mkdirSync(localesDir, { recursive: true });
let stale = 0;
for (const target of built.values()) {
  const file = path.join(localesDir, target.file);
  const next = `${JSON.stringify(target.data, null, 2)}\n`;
  const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
  if (current === next) continue;
  if (checkOnly) {
    console.error(`✗ locales/${target.file} is out of date. Run npm run i18n.`);
    stale += 1;
  } else {
    writeFileSync(file, next);
    console.log(`wrote locales/${target.file} (${leafPaths(target.data).length} keys)`);
  }
}
if (checkOnly && stale) process.exit(1);
console.log(checkOnly ? 'Locale files are up to date.' : 'i18n build done.');
