#!/usr/bin/env node
// Full-page screenshots of the storefront for every locale (he/en/ar) x viewport (mobile/desktop) x page.
// Env: SW_PREVIEW_THEME_ID (dev theme to preview), SW_STOREFRONT_PASSWORD, optional SW_STORE_URL,
//      SW_QA_PAGES / SW_QA_LOCALES / SW_QA_VIEWPORTS to narrow the run.
// Output: qa-output/<timestamp>-shots/<viewport>/<locale>-<page>.png + summary.json
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { launchBrowser } from '../lib/browser.mjs';
import {
  hidePreviewBar,
  loadConfig,
  loadLazyContent,
  newContext,
  openPage,
  outputDir,
  pageUrl,
  repoRoot,
  unlock,
  warnAboutMissingEnv,
} from './lib.mjs';

const cfg = loadConfig();
warnAboutMissingEnv(cfg);
const outDir = outputDir('shots');
const results = [];

const browser = await launchBrowser();
try {
  for (const viewport of cfg.viewports) {
    const context = await newContext(browser, viewport);
    await unlock(context, cfg);
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => msg.type() === 'error' && consoleErrors.push(msg.text()));
    page.on('pageerror', (error) => consoleErrors.push(String(error)));

    for (const locale of cfg.locales) {
      for (const target of cfg.pages) {
        consoleErrors.length = 0;
        const url = pageUrl(cfg, locale, target);
        const file = path.join(outDir, viewport.name, `${locale.code}-${target.name}.png`);
        mkdirSync(path.dirname(file), { recursive: true });
        const row = { viewport: viewport.name, locale: locale.code, page: target.name, url };
        try {
          Object.assign(row, await openPage(page, url));
          await hidePreviewBar(page);
          await loadLazyContent(page);
          await page.screenshot({ path: file, fullPage: true, timeout: 60000 });
          row.file = path.relative(repoRoot, file);
        } catch (error) {
          row.error = error.message.split('\n')[0];
        }
        row.consoleErrors = [...consoleErrors];
        results.push(row);
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}

writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(results, null, 2)}\n`);
for (const r of results) {
  const flags = [
    r.blocked && 'BLOCKED by Shopify rate limit / bot check',
    r.locked && 'LOCKED',
    r.error && `ERROR ${r.error}`,
    r.consoleErrors.length && `${r.consoleErrors.length} console error(s)`,
  ]
    .filter(Boolean)
    .join(', ');
  console.log(
    `${r.viewport.padEnd(8)} ${r.locale}  ${r.page.padEnd(11)} ${String(r.status ?? '-').padEnd(4)} dir=${r.dir ?? '-'}  ${r.file ?? ''} ${flags}`,
  );
}
console.log(`\nScreenshots and summary.json: ${path.relative(repoRoot, outDir)}`);
if (results.some((r) => r.blocked))
  console.log('Some pages were blocked by Shopify; re-run those later (SW_QA_PAGES=...).');
process.exit(results.some((r) => r.error || r.blocked) ? 1 : 0);
