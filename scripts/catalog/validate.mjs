#!/usr/bin/env node
// Validates catalog product files against catalog/product.schema.json, plus pipeline rules:
//  - the file name matches its handle, and the status matches its folder
//  - files in ready/ have no open questions, a price on every variant, and confirmed image rights
//  - SKUs and handles are unique across the whole catalog
// Usage: npm run catalog:validate                 (all of incoming/, ready/, published/)
//        node scripts/catalog/validate.mjs <file...>
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const catalogDir = path.join(repoRoot, 'catalog');
const STAGES = { incoming: ['needs_review'], ready: ['ready'], published: ['published_draft', 'active'] };

const schema = JSON.parse(readFileSync(path.join(catalogDir, 'product.schema.json'), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

// Records of store changes (published/<what>-YYYY-MM-DD.json) are logs, not product files.
const isRecord = (f) => /-\d{4}-\d{2}-\d{2}\.json$/.test(f);

const files =
  process.argv.length > 2
    ? process.argv.slice(2).map((f) => path.resolve(f))
    : Object.keys(STAGES).flatMap((stage) =>
        readdirSync(path.join(catalogDir, stage))
          .filter((f) => f.endsWith('.json') && !isRecord(f))
          .map((f) => path.join(catalogDir, stage, f)),
      );

const problems = [];
const seenSkus = new Map();
const seenHandles = new Map();

for (const file of files) {
  const rel = path.relative(repoRoot, file);
  const report = (msg) => problems.push(`${rel}: ${msg}`);
  let product;
  try {
    product = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    report(`invalid JSON (${error.message})`);
    continue;
  }
  if (!validate(product)) {
    for (const e of validate.errors) report(`schema ${e.instancePath || '/'} ${e.message}`);
  }
  if (product.handle && path.basename(file, '.json') !== product.handle)
    report(`file name must be ${product.handle}.json`);

  const stage = path.basename(path.dirname(file));
  if (STAGES[stage] && !STAGES[stage].includes(product.status)) {
    report(`status "${product.status}" does not belong in ${stage}/ (expected ${STAGES[stage].join(' or ')})`);
  }
  if (stage === 'ready' || stage === 'published') {
    if (product.questions?.length) report(`${product.questions.length} open question(s) must be resolved`);
    if (product.variants?.some((v) => typeof v.price !== 'number')) report('every variant needs a numeric price');
    if (product.source?.image_rights_confirmed !== true) report('image rights not confirmed by the owner');
  }

  if (product.handle) {
    if (seenHandles.has(product.handle)) report(`duplicate handle, also in ${seenHandles.get(product.handle)}`);
    seenHandles.set(product.handle, rel);
  }
  for (const v of product.variants ?? []) {
    if (!v.sku) continue;
    if (seenSkus.has(v.sku)) report(`duplicate SKU ${v.sku}, also in ${seenSkus.get(v.sku)}`);
    seenSkus.set(v.sku, rel);
  }
}

if (!files.length) console.log('No product files yet.');
for (const p of problems) console.log(`✗ ${p}`);
console.log(`${files.length} file(s) checked, ${problems.length} problem(s).`);
process.exit(problems.length ? 1 : 0);
