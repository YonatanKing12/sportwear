#!/usr/bin/env node
// Renders SportWear's link-preview (Open Graph) image, 1200x630 JPEG, in Hebrew, English and Arabic:
// the SW logo, the tagline and three shirts from the store on the Night Match background.
// See design/share/README.md for the products, the WhatsApp crop band and how it is published.
//
// Usage: node scripts/images/share-image.mjs [--cutouts <dir>] [--out <dir>]
//   --cutouts  transparent PNGs from scripts/images/cutout.py: barca.png, lakers23.png, realmadrid.png
//              (default qa-output/share/cutouts)
//   --out      where sw-share-<locale>.jpg go (default design/share)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../lib/browser.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argValue = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index > -1 ? path.resolve(process.argv[index + 1]) : fallback;
};
const CUTOUTS = argValue('--cutouts', path.join(repoRoot, 'qa-output/share/cutouts'));
const OUT = argValue('--out', path.join(repoRoot, 'design/share'));
const WORK = path.join(repoRoot, 'qa-output/share');
const ASSETS = path.join(repoRoot, 'assets');
const MARK = readFileSync(path.join(repoRoot, 'design/logo/sw-mark-white.svg'), 'utf8');

const COPY = {
  he: { dir: 'rtl', lines: ['חולצות כדורגל', 'וגופיות כדורסל'], sub: 'משלוח חינם עד הבית · החזרה עד 45 יום' },
  en: { dir: 'ltr', lines: ['Football &', 'basketball jerseys'], sub: 'Free home delivery · 45-day returns' },
  ar: { dir: 'rtl', lines: ['قمصان كرة القدم', 'وكرة السلة'], sub: 'توصيل مجاني إلى المنزل · إرجاع حتى 45 يومًا' },
};
const JERSEYS = { back1: 'barca', front: 'lakers23', back2: 'realmadrid' };

const font = (family, file, range, weight = '100 900') =>
  `@font-face{font-family:'${family}';font-weight:${weight};src:url('file://${ASSETS}/${file}') format('woff2');unicode-range:${range};}`;
const FONTS = [
  font('SW Display', 'font-anton-latin.woff2', 'U+0000-00FF, U+2000-206F'),
  font('SW Display', 'font-karantina-hebrew.woff2', 'U+0590-05FF, U+FB1D-FB4F'),
  font('SW Display', 'font-changa-arabic.woff2', 'U+0600-06FF, U+FB50-FDFF, U+FE70-FEFC'),
  font('SW Body', 'font-heebo-latin.woff2', 'U+0000-00FF, U+2000-206F', '400 800'),
  font('SW Body', 'font-heebo-hebrew.woff2', 'U+0590-05FF, U+FB1D-FB4F', '400 800'),
  font('SW Body', 'font-noto-sans-arabic.woff2', 'U+0600-06FF, U+FB50-FDFF, U+FE70-FEFC', '400 800'),
].join('\n');

function html(locale) {
  const c = COPY[locale];
  const rtl = c.dir === 'rtl';
  const img = (name) => `file://${CUTOUTS}/${name}.png`;
  return `<!doctype html><html lang="${locale}" dir="${c.dir}"><head><meta charset="utf-8"><style>
${FONTS}
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;overflow:hidden;background:#0D0E11}
.canvas{position:relative;width:1200px;height:630px;overflow:hidden;
  background:
    radial-gradient(520px 420px at ${rtl ? '308px' : '892px'} 330px, rgba(198,255,61,.20), rgba(198,255,61,0) 70%),
    radial-gradient(900px 600px at ${rtl ? '300px' : '900px'} 320px, #191c22, #0D0E11 70%);}
.lines{position:absolute;inset:0}
.art{position:absolute;top:0;${rtl ? 'left' : 'right'}:-12px;width:640px;height:630px}
.art img{position:absolute;filter:drop-shadow(0 22px 26px rgba(0,0,0,.55))}
.j-back1{height:318px;left:4px;top:190px;transform:rotate(-10deg)}
.j-back2{height:318px;left:300px;top:186px;transform:rotate(9deg)}
.j-front{height:424px;left:166px;top:106px}
.copy{position:absolute;top:50%;transform:translateY(-50%);${rtl ? 'right' : 'left'}:76px;width:466px;
  color:#F4F5F7;text-align:${rtl ? 'right' : 'left'}}
.lockup{display:flex;direction:ltr;align-items:center;gap:18px;justify-content:${rtl ? 'flex-end' : 'flex-start'}}
.lockup svg{height:58px;width:auto;display:block}
.word{font:400 56px/1 'SW Display';letter-spacing:.5px;color:#F4F5F7}
.rule{width:72px;height:6px;border-radius:3px;background:#C6FF3D;margin:30px ${rtl ? '0 0 0 auto' : 'auto 0 0 0'}}
.tag{font-family:'SW Display';font-weight:400;margin-top:22px;line-height:.95;text-wrap:balance}
.tag span{display:block;white-space:nowrap}
.tag .l2{color:#C6FF3D}
.sub{margin-top:22px;font:500 25px/1.35 'SW Body';color:#B4BAC4}
</style></head><body><div class="canvas">
<svg class="lines" viewBox="0 0 1200 630" aria-hidden="true">
  <g fill="none" stroke="rgba(255,255,255,.07)" stroke-width="2">
    <circle cx="${rtl ? 312 : 888}" cy="330" r="236"/>
    <line x1="${rtl ? 312 : 888}" y1="0" x2="${rtl ? 312 : 888}" y2="630"/>
    <circle cx="${rtl ? 312 : 888}" cy="330" r="6" fill="rgba(255,255,255,.07)"/>
  </g>
</svg>
<div class="art">
  <img class="j-back1" src="${img(JERSEYS.back1)}" alt="">
  <img class="j-back2" src="${img(JERSEYS.back2)}" alt="">
  <img class="j-front" src="${img(JERSEYS.front)}" alt="">
</div>
<div class="copy">
  <div class="lockup">${MARK}<span class="word">SportWear</span></div>
  <div class="tag" data-fit><span class="l1">${c.lines[0]}</span><span class="l2">${c.lines[1]}</span></div>
  <p class="sub">${c.sub}</p>
</div>
</div>
<script>
  // Largest size (up to 112px) at which each tagline line fits the column.
  document.fonts.ready.then(() => {
    const tag = document.querySelector('[data-fit]');
    let size = 104;
    tag.style.fontSize = size + 'px';
    const fits = () => [...tag.children].every((line) => line.scrollWidth <= tag.clientWidth);
    while (!fits() && size > 40) { size -= 2; tag.style.fontSize = size + 'px'; }
    document.body.dataset.ready = size;
  });
</script>
</body></html>`;
}

mkdirSync(WORK, { recursive: true });
mkdirSync(OUT, { recursive: true });
const browser = await launchBrowser();
try {
  for (const locale of Object.keys(COPY)) {
    const file = path.join(WORK, `share-${locale}.html`);
    writeFileSync(file, html(locale));
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await page.goto(`file://${file}`);
    await page.waitForFunction(() => document.body.dataset.ready);
    await page.waitForTimeout(300);
    const out = path.join(OUT, `sw-share-${locale}.jpg`);
    await page.screenshot({ path: out, type: 'jpeg', quality: 88 });
    console.log(
      `${locale}: ${path.relative(repoRoot, out)} (tagline ${await page.evaluate(() => document.body.dataset.ready)}px)`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
