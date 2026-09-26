#!/usr/bin/env node
// Crawls a Yupoo store's category tree and album listings (titles, cover URLs, photo counts; never
// the photos themselves) and writes a raw inventory for scripts/catalog/yupoo-normalize.mjs.
//
// Polite by design: one request at a time, at least 1.1 s apart, gentle retries with back-off, and
// every fetched page is cached on disk, so a re-run only fetches what is missing. Delete the cache
// folder to crawl fresh.
//
// Usage:
//   node scripts/catalog/yupoo-crawl.mjs [--store jerseyxie] [--cache <dir>] [--out <file>]
//        [--album-samples <n>]   also fetch n album pages (spread across categories) to see what they hold
//        [--sample-match <regex>] only sample albums whose title matches (e.g. "^(26-27|2026) ")
//        [--offline]             use the cache only; fail on a missing page
// Defaults: cache qa-output/<store>-cache/, out qa-output/<store>-cache/crawl.json (both git-ignored).
// Behind an HTTPS proxy (cloud sessions) the script re-runs itself with NODE_USE_ENV_PROXY=1 so
// Node's fetch uses it.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const child = spawnSync(process.execPath, ['--no-warnings', ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
  });
  process.exit(child.status ?? 1);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const STORE = opt('store', 'jerseyxie');
const BASE = `https://${STORE}.x.yupoo.com`;
const CACHE = path.resolve(repoRoot, opt('cache', `qa-output/${STORE}-cache`));
const OUT = path.resolve(repoRoot, opt('out', path.join(path.relative(repoRoot, CACHE), 'crawl.json')));
const OFFLINE = args.includes('--offline');
const ALBUM_SAMPLES = Number(opt('album-samples', '0'));
const SAMPLE_MATCH = opt('sample-match', null) ? new RegExp(opt('sample-match', ''), 'i') : null;
const MIN_GAP_MS = 1100;
const RETRY_WAITS_MS = [5000, 15000, 45000];
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

mkdirSync(CACHE, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastRequestAt = 0;
let fetched = 0;
let fromCache = 0;
const failures = [];

const cacheFile = (urlPath) =>
  path.join(CACHE, `${urlPath.replace(/^\//, '').replace(/[^A-Za-z0-9]+/g, '_') || 'home'}.html`);

async function get(urlPath) {
  const file = cacheFile(urlPath);
  if (existsSync(file)) {
    fromCache++;
    return readFileSync(file, 'utf8');
  }
  if (OFFLINE) throw new Error(`not in cache (offline): ${urlPath}`);
  for (let attempt = 0; ; attempt++) {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    let status = 0;
    let body = '';
    try {
      const res = await fetch(BASE + urlPath, {
        headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' },
        signal: AbortSignal.timeout(45000),
      });
      status = res.status;
      body = await res.text();
    } catch (err) {
      body = String(err?.cause?.code || err?.message || err);
    }
    if (status === 200 && body.length > 1000) {
      writeFileSync(file, body);
      fetched++;
      if (fetched % 25 === 0) console.error(`  fetched ${fetched} pages (${fromCache} from cache)`);
      return body;
    }
    if (status === 404 || attempt >= RETRY_WAITS_MS.length) {
      failures.push({ url: urlPath, status, note: body.slice(0, 120) });
      console.error(`  giving up on ${urlPath}: ${status} ${body.slice(0, 80)}`);
      return null;
    }
    console.error(`  ${urlPath}: ${status || body.slice(0, 60)}, retrying in ${RETRY_WAITS_MS[attempt] / 1000}s`);
    await sleep(RETRY_WAITS_MS[attempt]);
  }
}

const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

// The category tree from the header menu: top-level items, each with its sub-categories.
function parseTree(html) {
  const start = html.indexOf('showheader__category_new');
  if (start < 0) throw new Error('category menu not found on the home page');
  const menu = html.slice(start);
  const tops = [];
  for (const chunk of menu.split('<li class="showheader__category_item').slice(1)) {
    const top = chunk.match(/class="showheader__link" href="\/categories\/(\d+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!top) continue;
    const children = [
      ...chunk.matchAll(/class="showheader__child_link" href="\/categories\/(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g),
    ].map((m) => ({ id: m[1], name: decode(m[2]) }));
    tops.push({ id: top[1], name: decode(top[2]), children });
  }
  return tops;
}

// One listing page: the album cards, plus the total and page count when shown.
function parseListing(html) {
  const albums = [];
  const re = /<a\s+class="album__main"\s+title="([^"]*)"\s+href="\/albums\/(\d+)\?[^"]*"\s*>([\s\S]*?)<\/a>/g;
  for (const m of html.matchAll(re)) {
    const inner = m[3];
    const cover = inner.match(/(?:data-src|src)="(https?:\/\/photo\.yupoo\.com\/[^"]+)"/)?.[1] ?? null;
    const photos = inner.match(/album__photonumber">\s*(\d+)\s*</)?.[1];
    albums.push({ id: m[2], title: decode(m[1]), cover, photos: photos === undefined ? null : Number(photos) });
  }
  // The page language follows Accept-Language: "in total 178 albums" / "共178个相册".
  const total = html.match(/(?:in total\s*(\d+)\s*albums|共\s*(\d+)\s*个相册)/);
  const pages =
    html.match(/categories__box-right-pagination-span">\s*\d+\s*\/\s*(\d+)\s*</) ??
    html.match(/(?:in total\s*(\d+)\s*pages|共\s*(\d+)\s*页)/);
  const num = (m) => (m ? Number(m[1] ?? m[2]) : null);
  return { albums, total: num(total), pages: num(pages) ?? 1 };
}

const albums = new Map(); // id -> { id, title, cover, photos, categories: Set<catId>, in_album_listing }
function record(entry, catId) {
  let a = albums.get(entry.id);
  if (!a) {
    a = { id: entry.id, title: entry.title, cover: entry.cover, photos: entry.photos, categories: new Set() };
    albums.set(entry.id, a);
  }
  if (entry.title && entry.title !== a.title && entry.title.length > a.title.length) a.title = entry.title;
  if (!a.cover && entry.cover) a.cover = entry.cover;
  // Category listings can show 0 photos for albums added the same day; keep the highest count seen.
  if (entry.photos !== null && (a.photos === null || entry.photos > a.photos)) a.photos = entry.photos;
  if (catId) a.categories.add(catId);
  return a;
}

async function crawlListing(label, firstPath, pagePath, catId) {
  const first = await get(firstPath);
  if (!first) return { total: null, pages: 0, seen: 0 };
  const p1 = parseListing(first);
  const ids = new Set();
  for (const e of p1.albums) ids.add(record(e, catId).id);
  for (let page = 2; page <= p1.pages; page++) {
    const html = await get(pagePath(page));
    if (!html) continue;
    for (const e of parseListing(html).albums) ids.add(record(e, catId).id);
  }
  const note = p1.total !== null && ids.size !== p1.total ? ` (listing says ${p1.total})` : '';
  console.error(`${label}: ${ids.size} albums on ${p1.pages} page(s)${note}`);
  return { total: p1.total, pages: p1.pages, seen: ids.size };
}

console.error(`Crawling ${BASE} (cache: ${path.relative(repoRoot, CACHE)})`);
const home = await get('/');
if (!home) throw new Error('could not fetch the home page');
const tree = parseTree(home);
const categories = [];
for (const top of tree) {
  categories.push({ id: top.id, name: top.name, parent_id: null, sub: false });
  for (const c of top.children) categories.push({ id: c.id, name: c.name, parent_id: top.id, sub: true });
}
console.error(`${tree.length} top-level categories, ${categories.length - tree.length} sub-categories`);

for (const cat of categories) {
  const q = cat.sub ? '?isSubCate=true' : '';
  const label = cat.parent_id ? `${categories.find((c) => c.id === cat.parent_id).name} > ${cat.name}` : cat.name;
  const res = await crawlListing(
    label,
    `/categories/${cat.id}${q}`,
    (page) => `/categories/${cat.id}${q ? `${q}&` : '?'}page=${page}`,
    cat.id,
  );
  Object.assign(cat, { total_albums: res.total, pages: res.pages, albums_seen: res.seen });
}

// The /albums listing (the store's own "all albums" view).
const allListing = await crawlListing('/albums', '/albums', (page) => `/albums?page=${page}`, null);
const inAlbumListing = new Set();
for (let page = 1; page <= allListing.pages; page++) {
  const html = await get(page === 1 ? '/albums' : `/albums?page=${page}`);
  if (html) for (const e of parseListing(html).albums) inAlbumListing.add(e.id);
}

// Optional: sample album pages to see what an album holds (photo sizes, description, prices).
const samples = [];
if (ALBUM_SAMPLES > 0) {
  const byCat = new Map();
  for (const a of albums.values()) {
    if (SAMPLE_MATCH && !SAMPLE_MATCH.test(a.title)) continue;
    const key = [...a.categories].sort().join(',');
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key).push(a);
  }
  // One album per category combination; with a title filter, spread over all matching albums instead.
  const pool = SAMPLE_MATCH ? [...byCat.values()].flat() : [...byCat.values()].map((list) => list[0]);
  const step = Math.max(1, Math.floor(pool.length / ALBUM_SAMPLES));
  for (let i = 0; i < pool.length && samples.length < ALBUM_SAMPLES; i += step) {
    const a = pool[i];
    const html = await get(`/albums/${a.id}?uid=1`);
    if (!html) continue;
    const photos = [...html.matchAll(/data-width="(\d+)"\s+data-height="(\d+)"/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]);
    const subtitle = html.match(/showalbumheader__gallerysubtitle[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
    const names = [...html.matchAll(/<h3 title="([^"]*)"/g)].map((m) => decode(m[1]));
    samples.push({
      id: a.id,
      title: a.title,
      photo_count: photos.length,
      photo_sizes: photos,
      photo_names: names,
      description: decode(subtitle.replace(/<[^>]+>/g, ' ')),
    });
  }
}

const out = {
  source: BASE,
  crawled_at: new Date().toISOString(),
  pages_fetched: fetched,
  pages_from_cache: fromCache,
  failures,
  categories,
  album_listing: { pages: allListing.pages, albums: inAlbumListing.size },
  albums: [...albums.values()]
    .sort((a, b) => Number(b.id) - Number(a.id))
    .map((a) => ({ ...a, categories: [...a.categories], in_album_listing: inAlbumListing.has(a.id) })),
  album_samples: samples,
};
mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
console.error(
  `Done: ${out.albums.length} distinct albums, ${fetched} pages fetched, ${fromCache} from cache, ${failures.length} failures -> ${path.relative(repoRoot, OUT)}`,
);
