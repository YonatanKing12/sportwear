#!/usr/bin/env node
// Automated accessibility scan (axe-core, WCAG 2.0/2.1/2.2 A+AA) of the storefront pages in he/en/ar.
// Same env as qa:shots. Automated checks catch only part of the issues: keyboard and screen-reader
// passes are still needed before launch.
// Output: qa-output/<timestamp>-a11y/a11y.json. Exits 1 on any critical or serious violation.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { launchBrowser } from '../lib/browser.mjs';
import { loadConfig, newContext, openPage, outputDir, pageUrl, repoRoot, unlock, warnAboutMissingEnv } from './lib.mjs';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const cfg = loadConfig();
warnAboutMissingEnv(cfg);
const outDir = outputDir('a11y');
const report = [];

const browser = await launchBrowser();
try {
  for (const viewport of cfg.viewports) {
    const context = await newContext(browser, viewport);
    await unlock(context, cfg);
    const page = await context.newPage();
    for (const locale of cfg.locales) {
      for (const target of cfg.pages) {
        const url = pageUrl(cfg, locale, target);
        const entry = { viewport: viewport.name, locale: locale.code, page: target.name, url };
        try {
          Object.assign(entry, await openPage(page, url));
          if (entry.blocked) throw new Error('blocked by Shopify rate limit / bot check; re-run this page later');
          const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
          entry.violations = result.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            help: v.help,
            helpUrl: v.helpUrl,
            count: v.nodes.length,
            targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
          }));
        } catch (error) {
          entry.error = error.message.split('\n')[0];
        }
        report.push(entry);
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}

writeFileSync(path.join(outDir, 'a11y.json'), `${JSON.stringify(report, null, 2)}\n`);
let blocking = 0;
for (const entry of report) {
  const head = `${entry.viewport.padEnd(8)} ${entry.locale}  ${entry.page.padEnd(11)}`;
  if (entry.error) {
    console.log(`${head} ERROR ${entry.error}`);
    continue;
  }
  const lock = entry.locked ? ' (LOCKED: password page)' : '';
  if (!entry.violations.length) {
    console.log(`${head} no violations${lock}`);
    continue;
  }
  console.log(`${head} ${entry.violations.length} violation type(s)${lock}`);
  for (const v of entry.violations) {
    if (v.impact === 'critical' || v.impact === 'serious') blocking += 1;
    console.log(`    [${v.impact}] ${v.id} x${v.count}: ${v.help}`);
  }
}
console.log(`\nFull report: ${path.relative(repoRoot, path.join(outDir, 'a11y.json'))}`);
process.exit(blocking > 0 || report.some((e) => e.error) ? 1 : 0);
