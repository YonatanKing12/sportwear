#!/usr/bin/env node
// Serves the rendered preview (see render.mjs) and screenshots every page × locale × viewport,
// opens the cart drawer (and the menu drawer where its trigger is visible), and runs axe on each
// page. Everything that goes wrong in the browser is collected into one report:
// console errors, page errors, failed or 4xx/5xx requests, blocked external requests, the
// harness's [preview-gap] warnings, horizontal overflow, h1 count, broken images, axe violations.
//
// Usage:
//   node scripts/preview/serve-and-shoot.mjs [--out qa-output/preview] [--shots qa-output/preview-shots]
//        [--theme .] [--pages index,product] [--locales he,en,ar] [--viewports mobile,desktop]
//        [--no-axe] [--strict]
//   node scripts/preview/serve-and-shoot.mjs --serve [--port 4173]   (serve only, for manual browsing)
// Output: <shots>/<viewport>/<locale>-<page>.png, <shots>/<viewport>/<locale>-<page>--drawer-<name>.png,
//         <shots>/report.json
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import AxeBuilder from '@axe-core/playwright';
import { launchBrowser } from '../lib/browser.mjs';
import { Preview } from './lib/preview.mjs';
import { startServer } from './lib/server.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const VIEWPORTS = {
  mobile: { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
};
const DRAWERS = [
  { name: 'cart', id: 'CartDrawer', viewports: ['mobile', 'desktop'] },
  { name: 'menu', id: 'MenuDrawer', viewports: ['mobile'] },
];

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: path.join(repoRoot, 'qa-output/preview') },
    shots: { type: 'string', default: path.join(repoRoot, 'qa-output/preview-shots') },
    theme: { type: 'string' },
    pages: { type: 'string' },
    locales: { type: 'string' },
    viewports: { type: 'string' },
    'drawer-page': { type: 'string', default: 'index' },
    'no-axe': { type: 'boolean', default: false },
    serve: { type: 'boolean', default: false },
    port: { type: 'string' },
    strict: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(
    'Usage: node scripts/preview/serve-and-shoot.mjs [--out <dir>] [--shots <dir>] [--theme <dir>] [--pages a,b]\n' +
      '       [--locales he,en,ar] [--viewports mobile,desktop] [--drawer-page index] [--no-axe] [--strict]\n' +
      '       node scripts/preview/serve-and-shoot.mjs --serve [--port 4173]',
  );
  process.exit(0);
}

const outDir = path.resolve(values.out);
const reportFile = path.join(outDir, 'render-report.json');
if (!existsSync(reportFile)) {
  console.error(`No render found in ${path.relative(repoRoot, outDir)}. Run npm run preview:render first.`);
  process.exit(2);
}
const renderReport = JSON.parse(readFileSync(reportFile, 'utf8'));
const themeDir = path.resolve(repoRoot, values.theme ?? renderReport.theme);
const generatedFiles = new Map();
const makePreview = () =>
  new Preview({
    themeDir,
    fixturesDir: path.join(here, 'fixtures'),
    moneyFormat: renderReport.options?.money_format ?? undefined,
    moneyWithCurrencyFormat: renderReport.options?.money_with_currency_format ?? undefined,
    editorAttributes: renderReport.options?.editor_attributes ?? true,
    generatedFiles,
  });
// --serve is live: every page request re-reads the theme, so edits show up on refresh.
const server = await startServer({
  root: outDir,
  preview: values.serve ? makePreview : makePreview(),
  live: values.serve,
  port: Number(values.port ?? (values.serve ? 4173 : 0)),
});

if (values.serve) {
  console.log(`Preview server (live: theme files are re-read on every page load): ${server.url}/index.html`);
  console.log(`Storefront URLs work too, e.g. ${server.url}/ ${server.url}/en/products/demo-fc-home-jersey-2026-27`);
  for (const page of renderReport.pages) console.log(`  ${server.url}${page.url}`);
  console.log('Ctrl+C to stop.');
  await new Promise(() => {});
}

const split = (text) =>
  text
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
const onlyPages = split(values.pages);
const onlyLocales = split(values.locales);
const viewports = (split(values.viewports) ?? Object.keys(VIEWPORTS)).map((name) => {
  if (!VIEWPORTS[name]) throw new Error(`Unknown viewport "${name}" (mobile, desktop)`);
  return VIEWPORTS[name];
});
const targets = renderReport.pages.filter(
  (p) => (!onlyPages || onlyPages.includes(p.page)) && (!onlyLocales || onlyLocales.includes(p.locale)),
);
if (!targets.length) {
  console.error('Nothing to shoot: no rendered page matches --pages/--locales.');
  await server.close();
  process.exit(2);
}

const shotsDir = path.resolve(values.shots);
// Start from a clean folder, but only delete one this script created before.
if (existsSync(shotsDir) && readdirSync(shotsDir).length && !existsSync(path.join(shotsDir, 'report.json'))) {
  console.error(`${shotsDir} is not empty and was not created by serve-and-shoot; refusing to overwrite it.`);
  await server.close();
  process.exit(2);
}
rmSync(shotsDir, { recursive: true, force: true });
mkdirSync(shotsDir, { recursive: true });

/** Runs inside the page: layout and content checks that often reveal RTL/CSS bugs. */
function pageChecks() {
  const doc = document.documentElement;
  const viewportWidth = doc.clientWidth;
  const bar = document.querySelector('.sw-preview-gaps');
  const text = (document.body?.innerText ?? '').replace(bar?.innerText ?? '', '');
  const describe = (el) => {
    let out = el.tagName.toLowerCase();
    if (el.id) out += `#${el.id}`;
    const cls = [...el.classList].slice(0, 2).join('.');
    if (cls) out += `.${cls}`;
    const section = el.closest('.shopify-section');
    return section && section !== el ? `${section.id} ${out}` : out;
  };
  const clipped = (el) => {
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (['hidden', 'auto', 'scroll', 'clip'].includes(style.overflowX)) return true;
      if (style.position === 'fixed') return true;
    }
    return false;
  };
  // Compare with the root box, not with 0..innerWidth: when a page overflows, mobile browsers
  // widen the layout viewport, and in RTL the root box then sits at its right end.
  const root = doc.getBoundingClientRect();
  const sticking = [];
  if (doc.scrollWidth > viewportWidth + 1) {
    for (const el of document.body.querySelectorAll('*')) {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if ((rect.right > root.right + 1 || rect.left < root.left - 1) && !clipped(el)) sticking.push({ el, rect });
    }
  }
  // Report the innermost elements that stick out (their ancestors only stick out because of them).
  const offenders = sticking
    .filter(({ el }) => !sticking.some((other) => other.el !== el && el.contains(other.el)))
    .slice(0, 8)
    .map(
      ({ el, rect }) =>
        `${describe(el)} [${Math.round(rect.left - root.left)}…${Math.round(rect.right - root.left)} of 0…${Math.round(root.width)}]`,
    );
  return {
    lang: doc.lang || null,
    dir: doc.dir || null,
    title: document.title,
    h1: document.querySelectorAll('h1').length,
    horizontalOverflow: doc.scrollWidth > viewportWidth + 1,
    scrollWidth: doc.scrollWidth,
    viewportWidth,
    overflowingElements: offenders,
    liquidErrors: (text.match(/Liquid error/g) ?? []).length,
    missingTranslations: (text.match(/\[missing: [^\]]+\]/g) ?? []).slice(0, 10),
    brokenImages: [...document.images]
      .filter((img) => img.complete && img.naturalWidth === 0 && (img.currentSrc || img.src))
      .map((img) => img.currentSrc || img.src)
      .slice(0, 10),
    harnessMarkers: document.querySelectorAll('[data-sw-preview-marker]').length,
    gapCount: Number(document.querySelector('[data-sw-preview-gaps]')?.dataset.swPreviewGaps ?? 0),
  };
}

async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  // Scroll through the page so lazy images and scroll-triggered components load, then back to top.
  await page.evaluate(async () => {
    for (const img of document.querySelectorAll('img[loading="lazy"]')) img.loading = 'eager';
    const step = Math.max(200, window.innerHeight * 0.8);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    window.scrollTo(0, 0);
    await document.fonts?.ready;
  });
  await page
    .waitForFunction(() => [...document.images].every((img) => img.complete), null, { timeout: 5000 })
    .catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
}

async function runAxe(page) {
  if (values['no-axe']) return null;
  try {
    const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).exclude('.sw-preview-gaps').analyze();
    return result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      helpUrl: v.helpUrl,
      count: v.nodes.length,
      targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
    }));
  } catch (error) {
    return [{ id: 'axe-error', impact: null, help: error.message.split('\n')[0], count: 0, targets: [] }];
  }
}

function listen(page, entry, serverUrl) {
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.startsWith('[preview-gap]')) entry.gapWarnings.push(text.replace('[preview-gap] ', ''));
    else if (msg.type() === 'error') entry.consoleErrors.push(text);
    else if (msg.type() === 'warning') entry.consoleWarnings.push(text);
  });
  page.on('pageerror', (error) => entry.pageErrors.push(String(error.stack ?? error).split('\n')[0]));
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (!url.startsWith(serverUrl)) return;
    const reason = request.failure()?.errorText ?? '';
    // The browser cancels image requests it no longer needs (srcset re-selection, lazy → eager).
    if (reason.includes('ERR_ABORTED') && request.resourceType() === 'image') {
      entry.abortedImageRequests.push(url.replace(serverUrl, ''));
      return;
    }
    entry.failedRequests.push(`${request.method()} ${url.replace(serverUrl, '')}: ${reason}`);
  });
  page.on('response', (response) => {
    // Sections fetched by theme JavaScript (Section Rendering API, cart) report their gaps in a header.
    const header = response.headers()['x-sw-preview-gaps'];
    if (header) {
      try {
        const where = new URL(response.url()).pathname;
        for (const message of JSON.parse(decodeURIComponent(header)))
          entry.gapWarnings.push(`${message} (via ${where})`);
      } catch {
        entry.gapWarnings.push('unreadable x-sw-preview-gaps header');
      }
    }
    if (response.status() >= 400 && response.url().startsWith(serverUrl)) {
      entry.failedRequests.push(
        `${response.request().method()} ${response.url().replace(serverUrl, '')}: HTTP ${response.status()}`,
      );
    }
  });
}

async function openDrawer(page, drawer) {
  const result = { drawer: drawer.name, id: drawer.id, opened: false, trigger: null };
  const exists = await page.locator(`#${drawer.id}`).count();
  if (!exists) {
    result.note = `no element #${drawer.id} on the page`;
    return result;
  }
  const trigger = page.locator(`[data-drawer-open="${drawer.id}"]`).filter({ visible: true }).first();
  if (await trigger.count()) {
    try {
      await trigger.click({ timeout: 5000 });
      result.trigger = 'click';
    } catch (error) {
      // A trigger that is visible but not clickable (covered, or pushed off-screen) is a finding too.
      result.trigger = 'script-click';
      result.note = `the trigger could not be clicked like a user would (${error.message.split('\n')[0]}); clicked it from script`;
      await trigger.evaluate((el) => el.click());
    }
  } else {
    result.trigger = 'api';
    result.note = `no visible [data-drawer-open="${drawer.id}"] trigger; opened from code`;
    await page.evaluate(async (id) => {
      const element = document.getElementById(id);
      if (typeof element?.open === 'function') element.open();
      else element?.querySelector('dialog')?.showModal?.();
    }, drawer.id);
  }
  result.opened = await page
    .waitForFunction((id) => Boolean(document.querySelector(`#${id} dialog[open], dialog#${id}[open]`)), drawer.id, {
      timeout: 3000,
    })
    .then(() => true)
    .catch(() => false);
  await page.waitForTimeout(450);
  return result;
}

const report = {
  generated_at: new Date().toISOString(),
  server: server.url,
  theme: path.relative(repoRoot, themeDir) || '.',
  render_report: path.relative(repoRoot, reportFile),
  pages: [],
  drawers: [],
  render_gaps: renderReport.gaps,
};

const browser = await launchBrowser();
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor,
      isMobile: viewport.isMobile,
      hasTouch: viewport.hasTouch,
      locale: 'he-IL',
      timezoneId: 'Asia/Jerusalem',
    });
    const external = [];
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith(server.url) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
      external.push(url);
      return route.abort('blockedbyclient');
    });
    const dir = path.join(shotsDir, viewport.name);
    mkdirSync(dir, { recursive: true });

    for (const target of targets) {
      await fetch(`${server.url}/__preview/reset`);
      const entry = {
        viewport: viewport.name,
        locale: target.locale,
        page: target.page,
        template: target.template,
        url: `${server.url}${target.url}`,
        consoleErrors: [],
        consoleWarnings: [],
        pageErrors: [],
        failedRequests: [],
        abortedImageRequests: [],
        blockedExternalRequests: [],
        gapWarnings: [],
      };
      const page = await context.newPage();
      listen(page, entry, server.url);
      const externalBefore = external.length;
      try {
        const response = await page.goto(entry.url, { waitUntil: 'load', timeout: 30000 });
        entry.status = response?.status() ?? null;
        await settle(page);
        Object.assign(entry, await page.evaluate(pageChecks));
        const slug = `${target.locale}-${target.page.replace(/[^\w.-]+/g, '-')}`;
        const file = path.join(dir, `${slug}.png`);
        await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
        entry.screenshot = path.relative(repoRoot, file);
        entry.axe = await runAxe(page);

        if (target.page === values['drawer-page']) {
          for (const drawer of DRAWERS.filter((d) => d.viewports.includes(viewport.name))) {
            const result = { viewport: viewport.name, locale: target.locale, page: target.page };
            try {
              await page.evaluate(() => window.scrollTo(0, 0));
              Object.assign(result, await openDrawer(page, drawer));
              if (result.opened) {
                const shot = path.join(dir, `${slug}--drawer-${drawer.name}.png`);
                await page.screenshot({ path: shot, animations: 'disabled' });
                result.screenshot = path.relative(repoRoot, shot);
                result.axe = await runAxe(page);
                await page.keyboard.press('Escape');
                await page.waitForTimeout(350);
                result.closedWithEscape = await page.evaluate(
                  (id) => !document.querySelector(`#${id} dialog[open], dialog#${id}[open]`),
                  drawer.id,
                );
              }
            } catch (error) {
              Object.assign(result, { drawer: drawer.name, id: drawer.id, opened: false });
              result.error = error.message.split('\n')[0];
            }
            await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
            report.drawers.push(result);
          }
        }
      } catch (error) {
        entry.error = error.message.split('\n')[0];
      }
      entry.blockedExternalRequests = external.slice(externalBefore);
      await page.close();
      report.pages.push(entry);
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

/* ------------------------------------------------------------------------------------ summary */

const impacts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
for (const entry of [...report.pages, ...report.drawers]) {
  for (const v of entry.axe ?? []) if (v.impact in impacts) impacts[v.impact] += 1;
}
const count = (key) => report.pages.reduce((sum, p) => sum + (p[key]?.length ?? 0), 0);
report.summary = {
  screenshots: report.pages.filter((p) => p.screenshot).length + report.drawers.filter((d) => d.screenshot).length,
  page_errors: count('pageErrors'),
  console_errors: count('consoleErrors'),
  failed_requests: count('failedRequests'),
  blocked_external_requests: count('blockedExternalRequests'),
  pages_with_horizontal_overflow: report.pages
    .filter((p) => p.horizontalOverflow)
    .map((p) => `${p.viewport}/${p.locale}-${p.page}`),
  pages_without_single_h1: report.pages
    .filter((p) => p.h1 !== 1)
    .map((p) => `${p.viewport}/${p.locale}-${p.page} (${p.h1})`),
  broken_images: count('brokenImages'),
  liquid_errors: report.pages.reduce((sum, p) => sum + (p.liquidErrors ?? 0), 0),
  axe_violation_types_by_impact: impacts,
  distinct_harness_gaps: renderReport.gaps.length,
  drawers_not_opened: report.drawers
    .filter((d) => !d.opened)
    .map((d) => `${d.viewport}/${d.locale} ${d.drawer}: ${d.note ?? 'did not open'}`),
  errors: report.pages.filter((p) => p.error).map((p) => `${p.viewport}/${p.locale}-${p.page}: ${p.error}`),
};
writeFileSync(path.join(shotsDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

for (const p of report.pages) {
  const flags = [
    p.error && `ERROR ${p.error}`,
    p.pageErrors.length && `${p.pageErrors.length} page error(s)`,
    p.consoleErrors.length && `${p.consoleErrors.length} console error(s)`,
    p.failedRequests.length && `${p.failedRequests.length} failed request(s)`,
    p.blockedExternalRequests.length && `${p.blockedExternalRequests.length} external request(s) blocked`,
    p.horizontalOverflow && `overflow ${p.scrollWidth}px > ${p.viewportWidth}px`,
    p.h1 !== undefined && p.h1 !== 1 && `${p.h1} h1`,
    p.liquidErrors && `${p.liquidErrors} Liquid error(s)`,
    p.missingTranslations?.length && `${p.missingTranslations.length} missing translation(s)`,
    p.gapWarnings.length && `${p.gapWarnings.length} harness gap(s)`,
    p.axe?.length && `axe: ${p.axe.map((v) => `${v.id}(${v.impact})`).join(' ')}`,
  ]
    .filter(Boolean)
    .join(' · ');
  console.log(`${p.viewport.padEnd(7)} ${p.locale} ${p.page.padEnd(18)} dir=${p.dir ?? '-'} ${flags || 'ok'}`);
}
for (const d of report.drawers) {
  const state = d.opened
    ? `opened (${d.trigger})${d.closedWithEscape === false ? ', did NOT close on Escape' : ''}${d.note ? ` · ${d.note}` : ''}`
    : `NOT opened: ${d.error ?? d.note ?? ''}`;
  const axe = d.axe?.length ? ` · axe: ${d.axe.map((v) => `${v.id}(${v.impact})`).join(' ')}` : '';
  console.log(`drawer  ${d.viewport.padEnd(7)} ${d.locale} ${d.drawer.padEnd(5)} ${state}${axe}`);
}
const s = report.summary;
console.log(
  `\n${s.screenshots} screenshot(s) · page errors ${s.page_errors} · console errors ${s.console_errors} · failed requests ${s.failed_requests} · axe critical ${impacts.critical} serious ${impacts.serious} · harness gaps ${s.distinct_harness_gaps}`,
);
console.log(`Report: ${path.relative(repoRoot, path.join(shotsDir, 'report.json'))}`);
const failed =
  s.errors.length || (values.strict && (s.page_errors || s.console_errors || impacts.critical || impacts.serious));
process.exit(failed ? 1 : 0);
