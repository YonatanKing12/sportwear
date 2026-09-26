#!/usr/bin/env node
// Compares a normalized Yupoo supplier inventory (catalog/sources/<store>/albums.json, written by
// yupoo-normalize.mjs) with our Shopify products and writes the gap report: per album, whether we
// already sell it, sell a close variant, are missing it, or it is out of scope for this store.
// Read-only: it never talks to Shopify; export the products first (see the README).
//
// Usage:
//   node scripts/catalog/yupoo-gap.mjs --products <export.json|jsonl> [--store jerseyxie]
//        [--albums catalog/sources/<store>/albums.json] [--out catalog/sources/<store>/gap-report.json]
//        [--classification catalog/classification.json]
// <export>: our products with id, handle, title, productType, tags (a JSON array, a GraphQL
// response or pages of them, or JSONL from a bulk operation).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEAMS, LEAGUES, expand } from './yupoo-normalize.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const store = opt('store', 'jerseyxie');
const albumsFile = path.resolve(repoRoot, opt('albums', `catalog/sources/${store}/albums.json`));
const outFile = path.resolve(repoRoot, opt('out', `catalog/sources/${store}/gap-report.json`));
const productsFile = opt('products', null);
const classificationFile = path.resolve(repoRoot, opt('classification', 'catalog/classification.json'));
if (!productsFile) {
  console.error('Usage: node scripts/catalog/yupoo-gap.mjs --products <export.json|jsonl> [--store jerseyxie]');
  process.exit(2);
}

// ---------------------------------------------------------------------------------------------
// Our products (Hebrew titles) -> the same attributes

if (!existsSync(classificationFile)) {
  console.error(`${classificationFile} not found: our Hebrew titles are parsed with catalog/classification.json`);
  process.exit(2);
}
const C = JSON.parse(readFileSync(classificationFile, 'utf8'));

function loadProducts(file) {
  const text = readFileSync(path.resolve(repoRoot, file), 'utf8').trim();
  const found = [];
  const visit = (v) => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') {
      if (typeof v.handle === 'string' && typeof v.title === 'string') found.push(v);
      else Object.values(v).forEach(visit);
    }
  };
  try {
    visit(JSON.parse(text));
  } catch {
    for (const line of text.split('\n')) if (line.trim()) visit(JSON.parse(line));
  }
  return [...new Map(found.map((p) => [p.id ?? p.handle, p])).values()];
}

const heNorm = (t) =>
  t
    .replace(/(?<=[א-ת])['’`]/g, '׳')
    .replace(/(?<=[א-ת])["”]/g, '״')
    .replace(/\s+/g, ' ')
    .trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasPhrase = (text, phrase) =>
  new RegExp(`(?<![\\p{L}\\p{N}])${esc(heNorm(phrase))}(?![\\p{L}\\p{N}])`, 'u').test(text);
const sportsOf = (e) => (Array.isArray(e.sport) ? e.sport : [e.sport]);

function longestMatch(title, entries, sport) {
  let best = null;
  for (const [slug, e] of Object.entries(entries)) {
    if (sport && e.sport && !sportsOf(e).includes(sport)) continue;
    for (const phrase of e.match ?? []) {
      if (hasPhrase(title, phrase) && (!best || phrase.length > best.len)) best = { slug, len: phrase.length };
    }
  }
  return best?.slug ?? null;
}

const HE_KITS = [
  ['goalkeeper', /שוער/],
  ['training', /אימון/],
  ['fourth', /רביעית/],
  ['third', /שלישית/],
  ['special', /מהדורה מיוחדת|מהדורת הנצחה|מהדורה משותפת|מהדורת אליפות|מהדורת פרישה|הדפס/],
  ['away', /(?<![\p{L}])חוץ(?![\p{L}])/u],
  ['home', /(?<![\p{L}])בית(?![\p{L}])/u],
];
const HE_COLORS = [
  [/כחול כהה/, 'blue'],
  [/ירוק זית/, 'green'],
  [/ורוד כהה/, 'pink'],
  [/שחור/, 'black'],
  [/לבן/, 'white'],
  [/כחול|תכלת|טורקיז/, 'blue'],
  [/אדום|בורדו/, 'red'],
  [/ירוק/, 'green'],
  [/צהוב|זהב/, 'yellow'],
  [/סגול/, 'purple'],
  [/ורוד/, 'pink'],
  [/אפור|כסף/, 'grey'],
  [/כתום/, 'orange'],
  [/שמנת|בז׳/, 'cream'],
  [/חום/, 'brown'],
];

function parseHeSeason(title) {
  let m = title.match(/(?<!\d)(\d{4})\/(\d{2,4})(?!\d)/);
  if (m) return { season: `${m[1]}-${m[2].slice(-2)}`, start: Number(m[1]) };
  m = title.match(/(?<![\d/])(\d{2})\/(\d{2})(?![\d/])/);
  if (m && (Number(m[1]) + 1) % 100 === Number(m[2])) {
    const start = Number(m[1]) <= 30 ? 2000 + Number(m[1]) : 1900 + Number(m[1]);
    return { season: `${start}-${m[2]}`, start };
  }
  m = title.match(/(?<!\d)((?:19|20)\d{2})(?!\d)/);
  if (m) return { season: m[1], start: Number(m[1]) };
  return null;
}

const tagValue = (tags, prefix) => tags.find((t) => t.startsWith(`${prefix}:`))?.slice(prefix.length + 1) ?? null;

function normalizeProduct(p) {
  const title = heNorm(p.title);
  const tags = p.tags ?? [];
  const sport =
    C.product_types?.[p.productType]?.sport ??
    { 'Football Jersey': 'football', 'Basketball Jersey': 'basketball', 'Basketball Shorts': 'basketball' }[
      p.productType
    ] ??
    tagValue(tags, 'sport');
  const type = /shorts/i.test(p.productType) ? 'shorts' : /hoodie/i.test(p.productType) ? 'hoodie' : 'jersey';
  const override = C.overrides?.[p.handle] ?? {};
  let team = Object.hasOwn(override, 'team') ? override.team : longestMatch(title, C.teams, sport);
  if (!team) {
    const t = tagValue(tags, 'team');
    team = t ? (C.team_tag_aliases?.[t] ?? t) : null;
  }
  const season = parseHeSeason(title);
  let kit = null;
  for (const [k, re] of HE_KITS)
    if (re.test(title)) {
      kit = k;
      break;
    }
  const audience =
    tagValue(tags, 'audience') ?? (/לילדים|– ילדים/.test(title) ? 'kids' : /לנשים/.test(title) ? 'women' : 'adult');
  const colors = new Set();
  let rest = title;
  for (const [re, c] of HE_COLORS)
    if (re.test(rest)) {
      colors.add(c);
      rest = rest.replace(re, ' ');
    }
  return {
    id: p.id,
    handle: p.handle,
    title: p.title,
    demo: tags.includes('demo'),
    sport,
    type,
    team,
    league: TEAMS[team]?.league ?? C.teams?.[team]?.league ?? tagValue(tags, 'league'),
    season: season?.season ?? null,
    start: season?.start ?? null,
    kit,
    audience,
    version: /גרסת שחקן|גרסת שחקנים/.test(title) ? 'player' : 'fan',
    sleeve: /שרוול ארוך/.test(title) ? 'long' : 'short',
    number: title.match(/מספר\s+(\d{1,3})(?![\d/])/)?.[1] ? Number(title.match(/מספר\s+(\d{1,3})/)[1]) : null,
    player: override.player ?? longestMatch(title, C.players ?? {}, null),
    city: /מהדורת עיר/.test(title),
    retro: /רטרו/.test(title) || tags.includes('style:retro'),
    special: /מהדורה מיוחדת|מהדורה משותפת|מהדורת הנצחה|מהדורת אליפות|מהדורת פרישה/.test(title),
    colors: [...colors],
  };
}

// ---------------------------------------------------------------------------------------------
// Scope

// National-team kits follow tournament cycles: "25-26", "2026" and "26-27" are all the 2026 kits.
function seasonKey(a) {
  const start = a.start ?? (a.season ? Number(String(a.season).slice(0, 4)) : null);
  if (start === null || Number.isNaN(start)) return null;
  if (a.league === 'national-teams') return start % 2 ? start + 1 : start;
  return start;
}

const OTHER_ITEMS = {
  accessory: 'accessories',
  socks: 'accessories',
  't-shirt': 't-shirts',
  vest: 'training wear',
  'training-set': 'training wear',
  pants: 'training wear',
  'baseball-jersey': 'fashion and collabs',
  fashion: 'fashion and collabs',
};

function outOfScope(a) {
  if (a.sport === 'american-football') return 'NFL (we sell NFL hoodies only)';
  if (a.sport === 'other')
    return (
      { mlb: 'MLB and baseball', nhl: 'NHL', f1: 'F1 and motorsport', rugby: 'rugby', afl: 'AFL' }[a.league] ??
      'other sports'
    );
  if (a.type === 'jacket') return a.item === 'windbreaker' ? 'windbreakers' : 'jackets';
  if (a.type === 'tracksuit') return 'tracksuits';
  if (a.type === 'polo') return 'polos';
  if (a.type === 'hoodie') return 'hoodies and sweatshirts';
  if (a.type === 'other') return OTHER_ITEMS[a.item] ?? 'other items';
  if (!a.sport) return 'other items';
  if (a.kit === 'training') return 'training wear';
  if (a.baby) return 'baby sizes';
  if (a.sport === 'football' && a.type === 'shorts') return 'football shorts';
  if (!a.team && a.brand) return 'brand teamwear (no club)';
  return null;
}

// ---------------------------------------------------------------------------------------------
// Matching

function productKey(a) {
  if (a.sport === 'basketball') {
    return [
      'bb',
      a.team,
      a.type,
      a.audience,
      a.number ?? a.player ?? '-',
      a.edition ?? '-',
      a.season ?? '-',
      (a.colors ?? []).join('+'),
    ].join('|');
  }
  return [
    'fb',
    a.team ?? a.player ?? a.title,
    a.type,
    seasonKey(a) ?? '-',
    a.kit ?? '-',
    a.audience,
    a.version,
    a.sleeve,
  ].join('|');
}

function matchFootball(a, ours) {
  const sameTeam = ours.filter((p) => p.sport === 'football' && p.team === a.team);
  if (!sameTeam.length) return { status: 'missing' };
  const key = seasonKey(a);
  const sameSeason = sameTeam.filter((p) => key !== null && seasonKey(p) === key);
  if (!sameSeason.length) {
    const seasons = [...new Set(sameTeam.map((p) => p.season ?? '?'))].sort();
    return { status: 'missing', we_carry_team: seasons };
  }
  const audienceOk = (p) =>
    p.audience === a.audience || (a.audience === 'adult+kids' && ['adult', 'kids'].includes(p.audience));
  const scored = sameSeason
    .map((p) => {
      const differs = [];
      if (!a.kit || !p.kit) differs.push('kit unknown');
      else if (a.kit !== p.kit) differs.push('kit');
      else if (a.kit === 'special') differs.push('special edition (compare photos)');
      if (!audienceOk(p)) differs.push('audience');
      if (a.version !== p.version) differs.push('version');
      if (a.sleeve !== p.sleeve) differs.push('sleeve');
      return { p, differs };
    })
    .sort((x, y) => x.differs.length - y.differs.length);
  const best = scored[0];
  if (!best.differs.length) return { status: 'have', handle: best.p.handle };
  return { status: 'close_variant', handle: best.p.handle, differs: best.differs };
}

const edClass = (x) =>
  x.city || x.edition === 'city' ? 'city' : x.retro || x.edition === 'classic' ? 'retro' : 'regular';

function matchBasketball(a, ours) {
  const sameTeam = ours.filter((p) => p.sport === 'basketball' && p.team === a.team && p.type === a.type);
  if (!sameTeam.length) {
    const anyType = ours.some((p) => p.sport === 'basketball' && p.team === a.team);
    return { status: 'missing', ...(anyType ? { we_carry_team: true } : {}) };
  }
  let pool = sameTeam;
  if (a.number !== undefined && a.number !== null) {
    pool = sameTeam.filter((p) => p.number === a.number || (a.player && p.player && p.player.endsWith(a.player)));
    if (!pool.length) return { status: 'missing', we_carry_team: true, note: `no #${a.number} in our store` };
  } else if (a.type === 'jersey') {
    // A team-level album (no player number) cannot be told apart from our player jerseys.
    return { status: 'close_variant', handle: sameTeam[0].handle, differs: ['no player number in the album title'] };
  }
  const aYear = a.season ? Number(String(a.season).slice(0, 4)) : null;
  const scored = pool
    .map((p) => {
      const differs = [];
      if (edClass(a) !== edClass(p)) differs.push('edition');
      if (aYear && p.start && Math.abs(aYear - p.start) > 1) differs.push('year');
      if (a.colors?.length && p.colors.length && !a.colors.some((c) => p.colors.includes(c))) differs.push('color');
      if (a.audience !== p.audience) differs.push('audience');
      return { p, differs };
    })
    .sort((x, y) => x.differs.length - y.differs.length);
  const best = scored[0];
  if (!best.differs.length) {
    const vague = !a.colors?.length && !a.edition && !a.season;
    return {
      status: 'have',
      handle: best.p.handle,
      ...(vague ? { note: 'title has no colour, edition or year' } : {}),
    };
  }
  return { status: 'close_variant', handle: best.p.handle, differs: best.differs };
}

// ---------------------------------------------------------------------------------------------
// Run

const albumsDoc = JSON.parse(readFileSync(albumsFile, 'utf8'));
const albums = albumsDoc.albums.map((a) => expand(a, albumsDoc));
const products = loadProducts(productsFile);
const ours = products.map(normalizeProduct).filter((p) => !p.demo);

const unknownOurs = ours.filter((p) => !p.team && p.sport !== 'american-football');
const results = albums.map((a) => {
  const reason = outOfScope(a);
  if (reason) return { a, r: { status: 'out_of_scope', reason } };
  if (a.problems?.includes('team') || (!a.team && !a.player))
    return { a, r: { status: 'unparsed', reason: a.problems?.join(', ') ?? 'team' } };
  if (!a.team) return { a, r: { status: 'missing', note: 'player tribute without a club' } };
  const r = a.sport === 'basketball' ? matchBasketball(a, ours) : matchFootball(a, ours);
  if (TEAMS[a.team]?.ambiguous) r.note = `ambiguous team name: ${TEAMS[a.team].name}`;
  return { a, r };
});

// ---------------------------------------------------------------------------------------------
// Summary

const teamName = (slug) => TEAMS[slug]?.name ?? C.teams?.[slug]?.en ?? slug ?? '(no club)';
const leagueName = (slug) => LEAGUES[slug]?.name ?? C.leagues?.[slug]?.en ?? slug ?? '(unknown league)';
const countBy = (list, f) => {
  const m = {};
  for (const x of list) {
    const k = f(x);
    m[k] = (m[k] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(m).sort((x, y) => y[1] - x[1]));
};
const distinct = (list) => new Set(list.map(({ a }) => productKey(a))).size;

function groupMissing(list) {
  const byLeague = new Map();
  for (const x of list) {
    const lg = x.a.league ?? 'unknown';
    if (!byLeague.has(lg)) byLeague.set(lg, []);
    byLeague.get(lg).push(x);
  }
  return [...byLeague.entries()]
    .map(([league, items]) => {
      const byTeam = new Map();
      for (const x of items) {
        const t = x.a.team ?? '(no club)';
        if (!byTeam.has(t)) byTeam.set(t, []);
        byTeam.get(t).push(x);
      }
      return {
        league,
        name: leagueName(league),
        albums: items.length,
        products: distinct(items),
        teams: [...byTeam.entries()]
          .map(([team, ts]) => ({
            team,
            name: teamName(team),
            albums: ts.length,
            products: distinct(ts),
            seasons: countBy(ts, ({ a }) => a.season ?? '?'),
          }))
          .sort((x, y) => y.albums - x.albums),
      };
    })
    .sort((x, y) => y.albums - x.albums);
}

const byStatus = (s) => results.filter((x) => x.r.status === s);
const inScope = results.filter((x) => x.r.status !== 'out_of_scope');
const missing = byStatus('missing');
const current = (x) => Boolean(x.a.season) && Number(x.a.season.slice(0, 4)) >= 2026; // 26/27 is the current season
const slice = (list) => ({ albums: list.length, products: distinct(list), by_league: groupMissing(list) });
const summary = {
  albums: results.length,
  in_scope: inScope.length,
  have: byStatus('have').length,
  close_variant: byStatus('close_variant').length,
  missing: missing.length,
  unparsed: byStatus('unparsed').length,
  out_of_scope: byStatus('out_of_scope').length,
  distinct_products: {
    in_scope: distinct(inScope),
    have: distinct(byStatus('have')),
    close_variant: distinct(byStatus('close_variant')),
    missing: distinct(missing),
  },
  in_scope_by_sport: countBy(inScope, ({ a }) => a.sport),
  close_variant_differs: countBy(byStatus('close_variant'), ({ r }) => r.differs.join(' + ')),
  close_variant_groups: countBy(byStatus('close_variant'), ({ r }) => {
    const d = r.differs;
    if (d.some((x) => /unknown|special|no player number/.test(x))) return 'cannot tell from the title (check photos)';
    if (d.includes('kit') || d.includes('edition')) return 'another kit or edition of a team and season we sell';
    if (d.includes('audience')) return 'kids or women version of a kit we sell';
    return 'player version, long sleeve, colour or year variant of a product we sell';
  }),
  have_by_team: countBy(byStatus('have'), ({ a }) => a.team),
  out_of_scope_by_type: countBy(byStatus('out_of_scope'), ({ r }) => r.reason),
  missing_by_league: groupMissing(missing),
  missing_current_season: {
    ...slice(missing.filter(current)),
    for_teams_we_carry: distinct(missing.filter((x) => current(x) && x.r.we_carry_team)),
  },
  missing_highlights: {
    israeli_premier_league: slice(
      missing.filter(({ a }) => a.league === 'israeli-premier-league' || a.team === 'israel'),
    ),
    national_teams: slice(missing.filter(({ a }) => a.league === 'national-teams')),
    national_teams_2026_kits: slice(
      missing.filter(({ a }) => a.league === 'national-teams' && (seasonKey(a) === 2026 || a.cats?.includes(5061877))),
    ),
    retro: slice(missing.filter(({ a }) => a.retro)),
    kids: slice(missing.filter(({ a }) => a.audience === 'kids' || a.audience === 'adult+kids')),
    women: slice(missing.filter(({ a }) => a.audience === 'women')),
  },
  our_products: {
    total: products.length,
    compared: ours.length,
    by_sport: countBy(ours, (p) => p.sport),
    without_team: unknownOurs.map((p) => `${p.handle}: ${p.title}`),
  },
};

const report = {
  generated_at: new Date().toISOString(),
  inputs: {
    albums: path.relative(repoRoot, albumsFile),
    albums_crawled_at: albumsDoc.crawled_at,
    products: path.basename(productsFile),
    classification: {
      file: 'catalog/classification.json',
      version: C.version ?? null,
      teams: Object.keys(C.teams ?? {}).length,
    },
  },
  rules: {
    scope:
      'In scope: football jerseys (any season, retro, kids, women, goalkeeper, player version, long sleeve) and basketball jerseys and shorts. Out of scope (owner decides): other sports, NFL (we sell NFL hoodies only), accessories, windbreakers, jackets, polos, tracksuits, hoodies, training wear, T-shirts, football shorts, baby sizes, brand teamwear without a club.',
    football:
      'have = same team, season, kit and audience, and the same version (fan/player) and sleeve. close_variant = same team and season but a different kit, audience, version or sleeve, or a kit we cannot compare (unknown, or both special editions). missing = no product of that team and season. Seasons compare by start year; national teams by tournament cycle (25-26, 2026 and 26-27 are the 2026 kits).',
    basketball:
      'have = same team, type and player number, the same edition class (city / retro / regular), a compatible year and colour, and the same audience. close_variant = same team and number with another edition, year, colour or audience, or a team album with no number. missing = we do not sell that team, or not that number.',
    our_titles:
      'Our Hebrew titles are parsed with catalog/classification.json (team names), plus kit words (בית, חוץ, שלישית, רביעית, מהדורה מיוחדת, אימון), מספר N, colours, מהדורת עיר, רטרו. Our titles do not state fan/player, so they count as fan.',
  },
  summary,
  albums: results.map(({ a, r }) => ({ id: a.id, status: r.status, ...r })),
};

// Pretty-print the summary, but keep small or flat objects (a team's counts) on one line.
function pretty(v, indent = '') {
  const flat = JSON.stringify(v);
  const shallow = (x) =>
    x === null || typeof x !== 'object' || Object.values(x).every((y) => y === null || typeof y !== 'object');
  if (flat.length <= 100 || (v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(shallow)))
    return flat;
  const inner = indent + ' ';
  if (Array.isArray(v)) return `[\n${v.map((x) => inner + pretty(x, inner)).join(',\n')}\n${indent}]`;
  return `{\n${Object.entries(v)
    .map(([k, x]) => `${inner}${JSON.stringify(k)}: ${pretty(x, inner)}`)
    .join(',\n')}\n${indent}}`;
}

const { albums: rows, ...head } = report;
const headJson = pretty(head).replace(/\n\}$/, '');
writeFileSync(outFile, `${headJson},\n "albums": [\n${rows.map((x) => JSON.stringify(x)).join(',\n')}\n ]\n}\n`);

console.log(
  `Compared ${albums.length} supplier albums with ${ours.length} of our products -> ${path.relative(repoRoot, outFile)}`,
);
console.log(
  `in scope ${summary.in_scope}: have ${summary.have}, close variants ${summary.close_variant}, missing ${summary.missing}, unparsed ${summary.unparsed}; out of scope ${summary.out_of_scope}`,
);
console.log(`distinct products: ${JSON.stringify(summary.distinct_products)}`);
if (unknownOurs.length) console.log(`our products without a team (not compared): ${unknownOurs.length}`);
