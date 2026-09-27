// Builds the Hebrew store policies from scripts/legal/policies.js (the same builder the owner's paste page runs).
//
//   node scripts/legal/build-policies.mjs --date 2026-09-27
//     writes legal/policies/*.he.html: the texts with no business details filled in.
//   node scripts/legal/build-policies.mjs --date 2026-09-27 --page <out.html>
//     also writes the paste page: legal/paste-page.src.html with the builder inlined, ready to publish.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

const builderPath = path.join(root, 'scripts/legal/policies.js');
const builder = readFileSync(builderPath, 'utf8');
const sandbox = {};
sandbox.globalThis = sandbox;
vm.runInNewContext(builder, sandbox, { filename: builderPath });

const dateArg = option('--date');
const date = dateArg ? new Date(`${dateArg}T12:00:00`) : new Date();
if (Number.isNaN(date.getTime())) throw new Error(`Bad --date: ${dateArg}`);

const texts = sandbox.SWPolicies.build({}, date);
const files = {
  refund: 'refund-policy',
  terms: 'terms-of-service',
  privacy: 'privacy-policy',
  shipping: 'shipping-policy',
};
for (const [key, name] of Object.entries(files)) {
  const out = path.join(root, 'legal/policies', `${name}.he.html`);
  writeFileSync(out, `${texts[key]}\n`);
  console.log(`${path.relative(root, out)}  ${texts[key].length} chars`);
}

const pageOut = option('--page');
if (pageOut) {
  const source = readFileSync(path.join(root, 'legal/paste-page.src.html'), 'utf8');
  if (!source.includes('/*POLICIES_JS*/')) throw new Error('legal/paste-page.src.html lost its /*POLICIES_JS*/ slot');
  writeFileSync(pageOut, source.replace('/*POLICIES_JS*/', () => builder));
  console.log(`paste page: ${pageOut}`);
}
