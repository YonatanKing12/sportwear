// Shared helpers for the storefront QA scripts (screenshots, accessibility).
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Reads scripts/qa/config.json plus the SW_* environment variables.
export function loadConfig() {
  const config = JSON.parse(readFileSync(path.join(repoRoot, 'scripts/qa/config.json'), 'utf8'));
  const only = (name) =>
    process.env[name]
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  const pick = (list, names) => (names?.length ? list.filter((item) => names.includes(item.name ?? item.code)) : list);
  return {
    storeUrl: (process.env.SW_STORE_URL || config.store_url).replace(/\/$/, ''),
    previewThemeId: process.env.SW_PREVIEW_THEME_ID || null,
    password: process.env.SW_STOREFRONT_PASSWORD || null,
    locales: pick(config.locales, only('SW_QA_LOCALES')),
    viewports: pick(config.viewports, only('SW_QA_VIEWPORTS')),
    pages: pick(config.pages, only('SW_QA_PAGES')),
  };
}

export function warnAboutMissingEnv(cfg) {
  if (!cfg.previewThemeId) console.warn('! SW_PREVIEW_THEME_ID is not set: this run shows the LIVE theme.');
  if (!cfg.password) console.warn('! SW_STOREFRONT_PASSWORD is not set: a locked store only shows its password page.');
}

export function pageUrl(cfg, locale, page) {
  const pagePath = page.path === '/' && locale.path_prefix ? '' : page.path;
  const url = new URL(`${cfg.storeUrl}${locale.path_prefix}${pagePath}`);
  if (cfg.previewThemeId) url.searchParams.set('preview_theme_id', cfg.previewThemeId);
  return url.toString();
}

export async function newContext(browser, viewport) {
  return browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
  });
}

// Enters the storefront password once per context (the session cookie covers the rest).
export async function unlock(context, cfg) {
  if (!cfg.password) return;
  const page = await context.newPage();
  try {
    await page.goto(`${cfg.storeUrl}/password`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const field = page.locator('input[type="password"]').first();
    if ((await field.count()) === 0) return;
    await field.fill(cfg.password);
    await Promise.all([page.waitForLoadState('domcontentloaded'), field.press('Enter')]);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    if (page.url().includes('/password')) console.warn('! The storefront password was not accepted.');
  } finally {
    await page.close();
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// True when Shopify's edge answered with a rate limit or a human-verification page instead of the store.
async function isBlocked(page, status) {
  if (status === 429) return true;
  const text = await page.evaluate(() => document.body?.innerText?.slice(0, 500) ?? '').catch(() => '');
  return /needs to be verified|verify you are human|just a moment/i.test(text);
}

// Opens a page and waits until it is visually settled (network quiet, web fonts loaded).
// Rate limits get a polite back-off (5 s, then 20 s). This never tries to get past a human-verification
// check: a page that stays blocked is reported as `blocked` so its results are not trusted.
export async function openPage(page, url) {
  let response;
  let blocked = false;
  for (const wait of [0, 5000, 20000]) {
    if (wait) await sleep(wait);
    response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    blocked = await isBlocked(page, response?.status());
    if (!blocked) break;
  }
  await page.evaluate(() => document.fonts?.ready);
  return {
    status: response?.status() ?? null,
    finalUrl: page.url(),
    locked: page.url().includes('/password'),
    blocked,
    lang: await page.evaluate(() => document.documentElement.lang || null),
    dir: await page.evaluate(() => document.documentElement.dir || null),
  };
}

// Shopify's preview bar (shown on unpublished themes) is not part of the theme: hidden before screenshots
// and left out of the accessibility scan.
export const PREVIEW_BAR = '#PBarNextFrameWrapper';

export async function hidePreviewBar(page) {
  await page.addStyleTag({ content: `${PREVIEW_BAR}{display:none!important}` }).catch(() => {});
}

// Scrolls through the whole page so lazy images load, then back to the top, so full-page screenshots
// show real images instead of empty tiles.
export async function loadLazyContent(page) {
  await page.evaluate(async () => {
    const step = Math.max(window.innerHeight * 0.8, 400);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}

export function outputDir(kind) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(repoRoot, 'qa-output', `${stamp}-${kind}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}
