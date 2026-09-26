#!/usr/bin/env node
// Local preview renderer for the SportWear theme: renders the theme's Liquid with LiquidJS and a
// mock catalog into static HTML, so pages can be screenshotted without the password-protected
// storefront. A QA smoke test, not a Shopify clone: whatever it cannot emulate is listed on the
// page (bar at the end of <body>), logged with console.warn('[preview-gap] ...') and written to
// render-report.json.
//
// Usage:
//   node scripts/preview/render.mjs [--theme .] [--out qa-output/preview] [--locales he,en,ar]
//        [--pages index,product,collection,cart,search,page,404,list-collections]
//        [--money-format "₪{{amount}}"] [--no-editor-attributes]
// Output: <out>/<locale>/<page>.html, <out>/assets, <out>/files, <out>/compiled_assets,
//         <out>/index.html (links to every page), <out>/render-report.json
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { GAP_KINDS } from './lib/gaps.mjs';
import { Preview } from './lib/preview.mjs';
import { escapeHtml } from './lib/util.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

const { values } = parseArgs({
  options: {
    theme: { type: 'string', default: repoRoot },
    out: { type: 'string', default: path.join(repoRoot, 'qa-output/preview') },
    locales: { type: 'string' },
    pages: { type: 'string' },
    'money-format': { type: 'string' },
    'money-with-currency-format': { type: 'string' },
    'no-editor-attributes': { type: 'boolean', default: false },
    quiet: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(
    'Usage: node scripts/preview/render.mjs [--theme <dir>] [--out <dir>] [--locales he,en,ar] [--pages index,product,...]\n' +
      '       [--money-format "₪{{amount}}"] [--no-editor-attributes] [--quiet]\n' +
      'Page ids: index, product, product-sale, product-kids, product-set, collection, collection-empty,\n' +
      '  list-collections, search, search-empty, cart, cart-empty, page, 404, blog, article, password,\n' +
      '  <template>.<suffix> (alternate templates), product:<handle>, collection:<handle>, page:<handle>,\n' +
      '  article:<handle>, search:<terms>; any id can end with ?query (e.g. collection:football?page=2).',
  );
  process.exit(0);
}

const themeDir = path.resolve(values.theme);
const outDir = path.resolve(values.out);
const options = {
  themeDir,
  fixturesDir: path.join(here, 'fixtures'),
  moneyFormat: values['money-format'],
  moneyWithCurrencyFormat: values['money-with-currency-format'],
  editorAttributes: !values['no-editor-attributes'],
};
const preview = new Preview(options);
const split = (text) =>
  text
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
const locales = split(values.locales) ?? preview.locales;
const pages = split(values.pages) ?? preview.defaultPages();

for (const locale of locales) {
  if (!preview.locales.includes(locale)) {
    console.error(`Unknown locale "${locale}". The preview knows: ${preview.locales.join(', ')}`);
    process.exit(2);
  }
  if (!preview.themeLocales.includes(locale)) {
    console.warn(`! The theme has no locales/${locale}*.json; every string will fall back or be missing.`);
  }
}

// Start from a clean output folder, but only delete a folder this script created before.
if (existsSync(outDir)) {
  const entries = readdirSync(outDir);
  if (entries.length && !entries.includes('render-report.json')) {
    console.error(`${outDir} is not empty and was not created by the preview renderer; refusing to overwrite it.`);
    process.exit(2);
  }
  rmSync(outDir, { recursive: true, force: true });
}
mkdirSync(outDir, { recursive: true });

const started = Date.now();
const rendered = [];
for (const locale of locales) {
  mkdirSync(path.join(outDir, locale), { recursive: true });
  for (const id of pages) {
    let spec;
    try {
      spec = preview.pageSpec(id, locale);
    } catch (error) {
      console.error(`✗ ${error.message}`);
      process.exit(2);
    }
    const file = Preview.fileName(id);
    const { html, gaps, sections } = preview.renderPage(spec);
    writeFileSync(path.join(outDir, locale, file), html);
    rendered.push({
      locale,
      page: id,
      template: spec.suffix ? `${spec.template}.${spec.suffix}` : spec.template,
      url: `/${locale}/${file}`,
      file: path.relative(repoRoot, path.join(outDir, locale, file)),
      storefront_path: `${locale === 'he' ? '' : `/${locale}`}${spec.path === '/' && locale !== 'he' ? '' : spec.path}`,
      sections,
      gaps: gaps.length,
      gap_list: gaps.map((g) => `[${g.kind}] ${g.message}${g.where.length ? ` (${g.where.join(', ')})` : ''}`),
    });
  }
}

// Static files: theme assets, fixture images, generated bundles and marker images.
const copyDir = (from, to) => {
  if (!existsSync(from)) return 0;
  mkdirSync(to, { recursive: true });
  let count = 0;
  for (const name of readdirSync(from)) {
    const source = path.join(from, name);
    if (name.startsWith('.')) continue;
    copyFileSync(source, path.join(to, name.replace(/\.liquid$/, '')));
    count += 1;
  }
  return count;
};
const assetCount = copyDir(path.join(themeDir, 'assets'), path.join(outDir, 'assets'));
const imageCount = copyDir(path.join(here, 'fixtures/images'), path.join(outDir, 'files'));
for (const [url, { content }] of preview.generatedFiles) {
  const target = path.join(outDir, url);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

const gaps = [...preview.allGaps.values()].sort(
  (a, b) => a.kind.localeCompare(b.kind) || b.pages.length - a.pages.length || a.message.localeCompare(b.message),
);
const report = {
  generated_at: new Date().toISOString(),
  theme: path.relative(repoRoot, themeDir) || '.',
  options: {
    money_format: options.moneyFormat ?? null,
    money_with_currency_format: options.moneyWithCurrencyFormat ?? null,
    editor_attributes: options.editorAttributes,
  },
  locales,
  pages: rendered,
  gap_kinds: GAP_KINDS,
  gaps,
};
writeFileSync(path.join(outDir, 'render-report.json'), `${JSON.stringify(report, null, 2)}\n`);

const rows = rendered
  .map(
    (r) =>
      `<tr><td>${r.locale}</td><td><a href="${escapeHtml(r.url)}">${escapeHtml(r.page)}</a></td><td>${escapeHtml(r.template)}</td><td>${r.gaps}</td></tr>`,
  )
  .join('');
writeFileSync(
  path.join(outDir, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>SportWear preview</title><style>body{font:14px/1.5 system-ui,sans-serif;margin:24px}td,th{padding:4px 12px;text-align:left}</style><h1>SportWear local preview</h1><p>Rendered ${escapeHtml(report.generated_at)} from <code>${escapeHtml(report.theme)}</code>. Storefront URLs such as <a href="/">/</a>, <a href="/en">/en</a>, <a href="/products/demo-fc-home-jersey-2026-27">/products/…</a> are rendered on demand by the preview server.</p><table><tr><th>Locale</th><th>Page</th><th>Template</th><th>Gaps</th></tr>${rows}</table>`,
);

const byKind = {};
for (const gap of gaps) byKind[gap.kind] = (byKind[gap.kind] ?? 0) + 1;
console.log(
  `Rendered ${rendered.length} page(s) (${locales.join(', ')} × ${pages.length}) in ${((Date.now() - started) / 1000).toFixed(1)}s → ${path.relative(repoRoot, outDir) || outDir}`,
);
console.log(`Copied ${assetCount} asset(s) and ${imageCount} fixture image(s).`);
if (gaps.length) {
  console.log(
    `\n${gaps.length} distinct gap(s): ${Object.entries(byKind)
      .map(([k, n]) => `${k} ${n}`)
      .join(', ')}`,
  );
  if (!values.quiet) {
    for (const gap of gaps.slice(0, 40)) {
      const where = gap.where.length ? ` (${gap.where.slice(0, 3).join(', ')})` : '';
      console.log(`  [${gap.kind}] ${gap.message}${where} — ${gap.pages.length} page(s)`);
    }
    if (gaps.length > 40) console.log(`  … ${gaps.length - 40} more in render-report.json`);
  }
} else {
  console.log('No gaps.');
}
console.log(`\nReport: ${path.relative(repoRoot, path.join(outDir, 'render-report.json'))}`);
