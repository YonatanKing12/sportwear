#!/usr/bin/env node
// Computes the storefront-filter data (see catalog/README.md, "Storefront filters"). It never writes to
// Shopify: apply its output through the Shopify MCP GraphQL workflow.
//
// 1. Product metafields (namespace sportwear), mirrored from the product's tags. Values are
//    language-neutral slugs; the theme shows them by name (snippets/facet-label.liquid).
//      audience       audience:<adult|kids|women>                      single_line_text_field
//      team_handle    team:<slug>, the team collection's handle        single_line_text_field
//      league_handle  league:<slug>                                    single_line_text_field
//      styles         style:<retro|city-edition|special>, any number   list.single_line_text_field
//      player         player:<slug>, any number                        list.single_line_text_field
//      kit            kit:<home|away|...>; football shirts without the tag take it from their Hebrew
//                     title (בית, חוץ, שלישית, רביעית, אימון, מהדורה) and get the tag too
// 2. The names dictionary (shop metafield sportwear.filter_names, JSON): he/en/ar names for every value
//    above and for the product types, from catalog/taxonomy.json (catalog/classification.json fills the
//    gaps). Enumerations carry an "order"; teams, leagues and players sort by name in the theme.
//
// Usage:
//   node scripts/catalog/filter-data.mjs <products.json|products.jsonl> [--out <dir>] [--per-request 8]
// <products>: the storefront's /products.json pages merged into one JSON array (numeric ids), or an
// Admin export in JSON lines with id, handle, title, productType and tags. Products tagged "demo" are
// skipped.
//
// Writes to <dir> (default: ./filter-data):
//   plan.json           counts, gaps and every product's values
//   requests/NN.json    { query, variables }: aliased metafieldsSet calls, 25 metafields per alias
//   kit-tags.json       the kit tags to add (tagsAdd) for the shirts whose kit came from the title
//   filter-names.json   the dictionary (value of the shop metafield sportwear.filter_names)
//   expected-counts.json  products per filter value, to check the store after applying (productsCount
//                       with metafields.sportwear.<key>:<value>, which needs the definitions to be
//                       admin-filterable)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildFilterNames } from '../lib/filter-names.mjs';

const NAMESPACE = 'sportwear';
const BATCH = 25;

function parseArgs(argv) {
  const args = { input: null, out: 'filter-data', perRequest: 8 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--per-request') args.perRequest = Number(argv[++i]);
    else if (a === '--help' || a === '-h') args.help = true;
    else if (!args.input) args.input = a;
    else throw new Error(`Unexpected argument: ${a}`);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.input) {
  console.log('Usage: node scripts/catalog/filter-data.mjs <products.json|products.jsonl> [--out <dir>]');
  process.exit(args.help ? 0 : 1);
}

// ---------- products ----------

function loadProducts(file) {
  const text = readFileSync(file, 'utf8').trim();
  const rows = text.startsWith('[') ? JSON.parse(text) : text.split('\n').map((line) => JSON.parse(line));
  return rows
    .filter((row) => row.title && row.handle)
    .map((row) => ({
      id: String(row.id).startsWith('gid://') ? row.id : `gid://shopify/Product/${row.id}`,
      handle: row.handle,
      title: row.title,
      productType: row.productType ?? row.product_type ?? '',
      tags: Array.isArray(row.tags)
        ? row.tags
        : String(row.tags ?? '')
            .split(/,\s*/)
            .filter(Boolean),
    }))
    .filter((p) => !p.tags.includes('demo'));
}

const tagValues = (tags, prefix) =>
  tags.filter((t) => t.startsWith(`${prefix}:`)).map((t) => t.slice(prefix.length + 1));

// Football shirts imported before wave 1 have no kit tag; their Hebrew titles name the kit.
const KIT_WORDS = [
  ['home', /(^|\s)בית(\s|$)/],
  ['away', /(^|\s)חוץ(\s|$)/],
  ['third', /שלישית/],
  ['fourth', /רביעית/],
  ['training', /(^|\s)אימון(\s|$)/],
  ['special', /מהדורה|מהדורת/],
];
const FOOTBALL_TYPES = new Set(['Football Jersey', 'Football Kit']);

function kitFromTitle(product) {
  if (!FOOTBALL_TYPES.has(product.productType)) return null;
  const hits = KIT_WORDS.filter(([, re]) => re.test(product.title)).map(([kit]) => kit);
  return hits.length === 1 ? hits[0] : null;
}

// ---------- plan ----------

const products = loadProducts(args.input);
const names = buildFilterNames();
const plan = [];
const kitTags = [];
const gaps = { no_audience: [], no_team: [], no_league: [], kit_unknown: [] };

for (const product of products) {
  const values = {};
  const audience = tagValues(product.tags, 'audience')[0];
  if (audience) values.audience = audience;
  else gaps.no_audience.push(product.handle);

  const team = tagValues(product.tags, 'team')[0];
  if (team) values.team_handle = team;
  else gaps.no_team.push(product.handle);

  const league = tagValues(product.tags, 'league')[0];
  if (league) values.league_handle = league;
  else gaps.no_league.push(product.handle);

  const styles = tagValues(product.tags, 'style');
  if (styles.length) values.styles = styles;

  const players = tagValues(product.tags, 'player');
  if (players.length) values.player = players;

  let kit = tagValues(product.tags, 'kit')[0];
  if (!kit) {
    kit = kitFromTitle(product);
    if (kit) kitTags.push({ id: product.id, handle: product.handle, title: product.title, tag: `kit:${kit}` });
    else if (FOOTBALL_TYPES.has(product.productType)) gaps.kit_unknown.push(`${product.handle} (${product.title})`);
  }
  if (kit) values.kit = kit;

  plan.push({ id: product.id, handle: product.handle, values });
}

// Values the dictionary has no complete he/en/ar name for (the theme would fall back to the slug).
const complete = (entry) => entry && entry.he && entry.en && entry.ar;
const missingNames = [];
for (const { handle, values } of plan) {
  for (const [key, value] of Object.entries(values)) {
    const list = Array.isArray(value) ? value : [value];
    const dict = names[key];
    for (const slug of list) if (!complete(dict?.[slug])) missingNames.push(`${key}:${slug} (${handle})`);
  }
}
for (const type of new Set(products.map((p) => p.productType))) {
  if (!complete(names.product_type[type])) missingNames.push(`product_type:${type}`);
}

// ---------- output ----------

const metafields = plan.flatMap(({ id, values }) =>
  Object.entries(values).map(([key, value]) => ({
    ownerId: id,
    namespace: NAMESPACE,
    key,
    value: Array.isArray(value) ? JSON.stringify(value) : value,
  })),
);

const batches = [];
for (let i = 0; i < metafields.length; i += BATCH) batches.push(metafields.slice(i, i + BATCH));

function requestDocument(count) {
  const vars = Array.from({ length: count }, (_, i) => `$m${i}: [MetafieldsSetInput!]!`).join(', ');
  const calls = Array.from(
    { length: count },
    (_, i) => `  b${i}: metafieldsSet(metafields: $m${i}) { userErrors { field message code } }`,
  ).join('\n');
  return `mutation SetFilterMetafields(${vars}) {\n${calls}\n}`;
}

const outDir = path.resolve(args.out);
mkdirSync(path.join(outDir, 'requests'), { recursive: true });
const requests = [];
for (let i = 0; i < batches.length; i += args.perRequest) {
  const group = batches.slice(i, i + args.perRequest);
  const variables = Object.fromEntries(group.map((batch, j) => [`m${j}`, batch]));
  const file = path.join(outDir, 'requests', `${String(requests.length + 1).padStart(2, '0')}.json`);
  writeFileSync(file, `${JSON.stringify({ query: requestDocument(group.length), variables })}\n`);
  requests.push({ file: path.relative(outDir, file), metafields: group.reduce((n, b) => n + b.length, 0) });
}

const counts = {};
for (const { values } of plan) {
  for (const [key, value] of Object.entries(values)) {
    for (const slug of Array.isArray(value) ? value : [value]) {
      counts[key] ??= {};
      counts[key][slug] = (counts[key][slug] ?? 0) + 1;
    }
  }
}

writeFileSync(path.join(outDir, 'filter-names.json'), `${JSON.stringify(names, null, 2)}\n`);
writeFileSync(path.join(outDir, 'kit-tags.json'), `${JSON.stringify(kitTags, null, 2)}\n`);
writeFileSync(path.join(outDir, 'expected-counts.json'), `${JSON.stringify(counts, null, 2)}\n`);
writeFileSync(
  path.join(outDir, 'plan.json'),
  `${JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      products: plan.length,
      metafields: metafields.length,
      requests,
      per_key: Object.fromEntries(
        Object.entries(counts).map(([key, values]) => [key, plan.filter((p) => p.values[key] !== undefined).length]),
      ),
      gaps,
      missing_names: missingNames,
      kit_from_title: kitTags.length,
      plan,
    },
    null,
    2,
  )}\n`,
);

console.log(`${plan.length} products, ${metafields.length} metafields in ${requests.length} requests → ${outDir}`);
for (const [key, values] of Object.entries(counts)) {
  const products_with = plan.filter((p) => p.values[key] !== undefined).length;
  console.log(
    `  ${key.padEnd(14)} ${String(products_with).padStart(5)} products, ${Object.keys(values).length} values`,
  );
}
console.log(`  kit from title: ${kitTags.length}; kit unknown: ${gaps.kit_unknown.length}`);
console.log(
  `  no team: ${gaps.no_team.length}; no league: ${gaps.no_league.length}; no audience: ${gaps.no_audience.length}`,
);
if (missingNames.length) {
  console.log(`  ! ${missingNames.length} values without a complete he/en/ar name:`);
  for (const m of [...new Set(missingNames)].slice(0, 30)) console.log(`    ${m}`);
}
