#!/usr/bin/env node
// Classifies products from their Hebrew titles and prints the tag plan: which tags to add and remove
// per product (team, league, season, style, player, audience, plus the plain search-keyword tags),
// and the products it could not classify. It never writes to Shopify.
//
// Usage:
//   node scripts/catalog/classify.mjs <products.jsonl> [--out plan.json] [--json] [--classification <file>]
//
// <products.jsonl>: one product per line with at least id, handle, title, productType and tags, for
// example the output of a bulkOperationRunQuery over products { id handle title productType tags }.
// Lines without a title (child objects of a bulk export) are ignored. Products tagged "demo" are skipped.
//
// The rules and names live in catalog/classification.json; see catalog/README.md.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function parseArgs(argv) {
  const args = {
    input: null,
    out: null,
    json: false,
    classification: path.join(repoRoot, 'catalog/classification.json'),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--classification') args.classification = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
    else if (!args.input) args.input = a;
    else throw new Error(`Unexpected argument: ${a}`);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.input) {
  console.log('Usage: node scripts/catalog/classify.mjs <products.jsonl> [--out plan.json] [--json]');
  process.exit(args.help ? 0 : 1);
}

const C = JSON.parse(readFileSync(args.classification, 'utf8'));
const taxonomy = JSON.parse(readFileSync(path.join(repoRoot, 'catalog/taxonomy.json'), 'utf8'));

// ---------- helpers ----------

// Titles sometimes use ASCII quotes instead of the Hebrew geresh/gershayim.
function normalizeTitle(title) {
  return title
    .replace(/(?<=[א-ת])['’`]/g, '׳')
    .replace(/(?<=[א-ת])["”]/g, '״')
    .replace(/\s+/g, ' ')
    .trim();
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phraseCache = new Map();
function hasPhrase(text, phrase) {
  let re = phraseCache.get(phrase);
  if (!re) {
    re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(normalizeTitle(phrase))}(?![\\p{L}\\p{N}])`, 'u');
    phraseCache.set(phrase, re);
  }
  return re.test(text);
}

const sportsOf = (entry) => (Array.isArray(entry.sport) ? entry.sport : [entry.sport]);

// The longest 'match' phrase found in the title wins, so "אינטר מיאמי" beats "אינטר".
function matchTeam(title, sport) {
  let best = null;
  for (const [slug, team] of Object.entries(C.teams)) {
    if (!sportsOf(team).includes(sport)) continue;
    for (const phrase of team.match ?? []) {
      if (hasPhrase(title, phrase) && (!best || phrase.length > best.phrase.length)) best = { slug, phrase };
    }
  }
  return best?.slug ?? null;
}

function matchPlayer(title) {
  let best = null;
  for (const [slug, player] of Object.entries(C.players)) {
    for (const phrase of player.match ?? []) {
      if (hasPhrase(title, phrase) && (!best || phrase.length > best.phrase.length)) best = { slug, phrase };
    }
  }
  return best?.slug ?? null;
}

// "26/27" or "2025/2026" -> { start: 2026, tag: "season:2026-27" }. A bare year is not a season.
function parseSeason(title) {
  let m = title.match(/(?<!\d)(\d{4})\/(\d{4})(?!\d)/);
  if (m && Number(m[2]) === Number(m[1]) + 1) {
    return { start: Number(m[1]), tag: `season:${m[1]}-${m[2].slice(2)}` };
  }
  m = title.match(/(?<![\d/])(\d{2})\/(\d{2})(?![\d/])/);
  if (m && (Number(m[1]) + 1) % 100 === Number(m[2])) {
    const start = Number(m[1]) >= 50 ? 1900 + Number(m[1]) : 2000 + Number(m[1]);
    return { start, tag: `season:${start}-${m[2]}` };
  }
  return null;
}

const shirtNumber = (title) => title.match(/מספר\s+(\d{1,3})(?![\d/])/)?.[1] ?? null;
const tagValues = (tags, prefix) =>
  tags.filter((t) => t.startsWith(`${prefix}:`)).map((t) => t.slice(prefix.length + 1));

// Shopify treats two tags with the same handle as one tag and keeps only the first: "all star" and
// "all-star", or "קפוצ'ון" and "קפוצון". Compare tags by this key so a re-run neither plans a tag that
// Shopify would drop nor removes the spelling it kept.
const tagKey = (tag) =>
  tag
    .toLowerCase()
    .replace(/['"’`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

// Every plain tag this script manages, so stale ones can be removed on a re-run.
const managedKeywords = new Set();
const addAll = (list) => (list ?? []).forEach((k) => managedKeywords.add(k));
Object.values(C.product_types).forEach((x) => addAll(x.keywords));
Object.values(C.audiences).forEach((x) => addAll(x.keywords));
Object.values(C.styles).forEach((x) => addAll(x.keywords));
Object.values(C.leagues).forEach((x) => addAll(x.keywords));
Object.values(C.teams).forEach((x) => addAll(x.keywords));
Object.values(C.players).forEach((x) => {
  addAll(x.keywords);
  managedKeywords.add(x.he);
});

// ---------- consistency with taxonomy.json ----------

const warnings = [];
function compareNames(kind, slug, a, b) {
  for (const lang of ['he', 'en', 'ar']) {
    if (b?.[lang] !== undefined && a[lang] !== b[lang]) {
      warnings.push(`${kind} ${slug}: ${lang} name differs from taxonomy.json ("${a[lang]}" vs "${b[lang]}")`);
    }
  }
}
for (const [slug, league] of Object.entries(C.leagues)) compareNames('league', slug, league, taxonomy.leagues?.[slug]);
const taxonomyTeams = Object.fromEntries(Object.values(taxonomy.teams ?? {}).map((t) => [t.slug, t]));
for (const [slug, team] of Object.entries(C.teams)) compareNames('team', slug, team, taxonomyTeams[slug]);
for (const [slug, player] of Object.entries(C.players)) compareNames('player', slug, player, taxonomy.players?.[slug]);
for (const [slug, style] of Object.entries(C.styles)) compareNames('style', slug, style, taxonomy.styles?.[slug]);

// ---------- classify ----------

function classify(product) {
  const title = normalizeTitle(product.title);
  const tags = product.tags ?? [];
  const override = C.overrides[product.handle] ?? {};
  const has = (key) => Object.hasOwn(override, key);
  const notes = [];
  const problems = [];

  const sport = C.product_types[product.productType]?.sport ?? tagValues(tags, 'sport')[0] ?? null;
  if (!sport) problems.push('sport');

  // team
  let team = null;
  let teamKnown = false; // true when we are sure about the team (or sure there is none)
  let teamSource = null;
  if (has('team')) {
    team = override.team;
    teamKnown = true;
    teamSource = 'override';
  } else if (sport) {
    team = matchTeam(title, sport);
    if (team) {
      teamKnown = true;
      teamSource = 'title';
    } else {
      for (const value of tagValues(tags, 'team')) {
        const slug = C.teams[value] ? value : C.team_tag_aliases?.[value];
        if (slug && C.teams[slug]) {
          team = slug;
          teamKnown = true;
          teamSource = 'tag';
          break;
        }
      }
    }
  }
  if (team && !C.teams[team]) problems.push(`unknown team "${team}"`);
  if (!teamKnown) problems.push('team');
  const teamEntry = team ? C.teams[team] : null;

  // league
  let league;
  let leagueKnown = true;
  if (has('league')) league = override.league;
  else if (teamEntry) league = teamEntry.league ?? null;
  else if (teamKnown) league = null;
  else leagueKnown = false;
  if (leagueKnown && league === null && has('team') && override.team === null && !has('league')) {
    // No team and no league given: keep whatever league the product already has.
    leagueKnown = false;
  }
  if (league && !C.leagues[league]) problems.push(`unknown league "${league}"`);

  // season (football only) and styles
  const season = parseSeason(title);
  const styles = new Set();
  for (const [slug, style] of Object.entries(C.styles)) {
    if ((style.match ?? []).some((phrase) => hasPhrase(title, phrase))) styles.add(slug);
  }
  (teamEntry?.styles ?? []).forEach((s) => styles.add(s));
  if (season && season.start < C.retro_before_season) styles.add('retro');
  (override.styles ?? []).forEach((s) => styles.add(s));

  // player
  let player = null;
  let playerSource = null;
  if (has('player')) {
    player = override.player;
    playerSource = 'override';
  } else {
    player = matchPlayer(title);
    if (player) playerSource = 'title';
    else if ((sport === 'basketball' || sport === 'american-football') && team && C.player_numbers[team]) {
      const number = shirtNumber(title);
      player = (number && C.player_numbers[team][number]) || null;
      if (player) playerSource = 'number';
    }
  }
  if (player && !C.players[player]) problems.push(`unknown player "${player}"`);

  // audience
  const titleAudience = Object.entries(C.audiences).find(([, a]) =>
    (a.match ?? []).some((p) => hasPhrase(title, p)),
  )?.[0];
  const existingAudience = tagValues(tags, 'audience');
  const audience = existingAudience[0] ?? titleAudience ?? 'adult';
  if (titleAudience && existingAudience.length && !existingAudience.includes(titleAudience)) {
    notes.push(`title says audience:${titleAudience}, tag says audience:${existingAudience.join(',')}`);
  }

  // coverage: every product needs a sub-category
  if (sport === 'basketball' && !league && !styles.has('special') && leagueKnown)
    problems.push('league (or style:special)');
  if (sport === 'football' && !league && !styles.has('special') && leagueKnown) problems.push('league');

  // desired tags
  const want = new Set();
  const keywords = new Set();
  const addKeywords = (list) => (list ?? []).forEach((k) => keywords.add(k));
  if (sport) want.add(`sport:${sport}`);
  want.add(`audience:${audience}`);
  if (team) want.add(`team:${team}`);
  if (league) want.add(`league:${league}`);
  if (sport === 'football' && season) want.add(season.tag);
  styles.forEach((s) => want.add(`style:${s}`));
  if (player && C.players[player]) {
    want.add(`player:${player}`);
    want.add(C.players[player].he);
  }
  addKeywords(C.product_types[product.productType]?.keywords);
  existingAudience
    .concat(existingAudience.length ? [] : [audience])
    .forEach((a) => addKeywords(C.audiences[a]?.keywords));
  if (teamEntry) addKeywords(teamEntry.keywords);
  if (league) addKeywords(C.leagues[league]?.keywords);
  else if (!leagueKnown) tagValues(tags, 'league').forEach((l) => addKeywords(C.leagues[l]?.keywords));
  if (player && C.players[player]) addKeywords(C.players[player].keywords);
  styles.forEach((s) => addKeywords(C.styles[s]?.keywords));
  keywords.forEach((k) => want.add(k));
  // one spelling per tag handle (the first one wins, as in Shopify)
  const wantKeys = new Set();
  for (const t of [...want]) {
    if (wantKeys.has(tagKey(t))) want.delete(t);
    else wantKeys.add(tagKey(t));
  }

  // removals: stale values in the namespaces we decided, and stale managed keywords
  const remove = new Set();
  for (const t of tags) {
    if (wantKeys.has(tagKey(t))) continue;
    const ns = t.includes(':') ? t.slice(0, t.indexOf(':')) : null;
    if (ns === 'team' && teamKnown) remove.add(t);
    else if (ns === 'league' && leagueKnown) remove.add(t);
    else if (ns === 'style' || ns === 'player') remove.add(t);
    else if (ns === 'season' && sport === 'football') remove.add(t);
    else if (!ns && managedKeywords.has(t)) remove.add(t);
  }
  const haveKeys = new Set(tags.filter((t) => !remove.has(t)).map(tagKey));
  const add = [...want].filter((t) => !haveKeys.has(tagKey(t)));

  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    productType: product.productType,
    classification: {
      sport,
      team,
      teamSource,
      league: league ?? null,
      season: sport === 'football' ? (season?.tag ?? null) : null,
      styles: [...styles],
      player,
      playerSource,
      audience,
    },
    add,
    remove: [...remove],
    notes: [...notes, ...(override.note ? [`override: ${override.note}`] : [])],
    problems,
  };
}

// ---------- run ----------

const products = readFileSync(args.input, 'utf8')
  .split('\n')
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line))
  .filter((p) => p.title && p.handle && !p.__parentId);

const results = [];
const skipped = [];
for (const product of products) {
  if ((product.tags ?? []).includes('demo')) {
    skipped.push(product.handle);
    continue;
  }
  results.push(classify(product));
}

const changed = results.filter((r) => r.add.length || r.remove.length);
const unclassified = results.filter((r) => r.problems.length);
const count = (fn) =>
  results.reduce((map, r) => {
    const key = fn(r);
    if (key !== undefined && key !== null) map[key] = (map[key] ?? 0) + 1;
    return map;
  }, {});

const plan = {
  generated_at: new Date().toISOString(),
  input: path.basename(args.input),
  summary: {
    products: results.length,
    skipped_demo: skipped,
    to_change: changed.length,
    tags_to_add: changed.reduce((n, r) => n + r.add.length, 0),
    tags_to_remove: changed.reduce((n, r) => n + r.remove.length, 0),
    unclassified: unclassified.length,
    by_league: count((r) => r.classification.league ?? '(none)'),
    by_style: results.flatMap((r) => r.classification.styles).reduce((m, s) => ({ ...m, [s]: (m[s] ?? 0) + 1 }), {}),
    by_player: count((r) => r.classification.player),
    by_team: count((r) => r.classification.team),
  },
  warnings,
  unclassified: unclassified.map((r) => ({ handle: r.handle, title: r.title, missing: r.problems })),
  changes: changed.map(({ id, handle, title, productType, classification, add, remove, notes }) => ({
    id,
    handle,
    title,
    productType,
    classification,
    add,
    remove,
    ...(notes.length ? { notes } : {}),
  })),
};

if (args.out) writeFileSync(args.out, `${JSON.stringify(plan, null, 2)}\n`);
if (args.json) {
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
} else {
  const s = plan.summary;
  console.log(`${s.products} product(s) classified, ${skipped.length} demo skipped.`);
  console.log(`${s.to_change} to change: +${s.tags_to_add} tag(s), -${s.tags_to_remove} tag(s).`);
  console.log(`Leagues: ${JSON.stringify(s.by_league)}`);
  console.log(`Styles: ${JSON.stringify(s.by_style)}`);
  console.log(
    `Players: ${Object.keys(s.by_player).length} (${Object.values(s.by_player).reduce((a, b) => a + b, 0)} products)`,
  );
  for (const w of warnings) console.log(`! ${w}`);
  const noted = results.filter((r) => r.notes.some((n) => !n.startsWith('override:')));
  for (const r of noted) console.log(`! ${r.handle}: ${r.notes.filter((n) => !n.startsWith('override:')).join('; ')}`);
  if (unclassified.length) {
    console.log(`\nUnclassified (${unclassified.length}):`);
    for (const r of unclassified) console.log(`  ${r.handle}  ${r.title}  [missing: ${r.problems.join(', ')}]`);
  }
  if (args.out) console.log(`\nPlan written to ${args.out}`);
}
