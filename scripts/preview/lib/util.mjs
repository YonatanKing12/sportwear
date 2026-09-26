// Small helpers shared by the preview harness: HTML escaping, hashing, money and color math.
import { createHash } from 'node:crypto';

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Renders HTML attributes; null/undefined/false are skipped, true renders a bare attribute. */
export function attrs(object) {
  return Object.entries(object)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([key, value]) => (value === true ? ` ${key}` : ` ${key}="${escapeHtml(value)}"`))
    .join('');
}

export function shortHash(text, length = 10) {
  return createHash('sha1').update(String(text)).digest('hex').slice(0, length);
}

/** Stable positive integer from a string (used for fake Shopify ids). */
export function numericId(text, base = 7000000000000) {
  const hex = createHash('sha1').update(String(text)).digest('hex').slice(0, 10);
  return base + (parseInt(hex, 16) % 999999999);
}

/** Shopify's handleize: lowercase, punctuation and spaces become dashes. Keeps Hebrew/Arabic letters. */
export function handleize(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/['"’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

export function stripHtml(value) {
  return String(value ?? '')
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]*>/g, '');
}

/* ------------------------------------------------------------------------------------------ money */

const AMOUNT_FORMATS = {
  amount: [2, ',', '.'],
  amount_no_decimals: [0, ',', '.'],
  amount_with_comma_separator: [2, '.', ','],
  amount_no_decimals_with_comma_separator: [0, '.', ','],
  amount_with_apostrophe_separator: [2, "'", '.'],
  amount_no_decimals_with_space_separator: [0, ' ', ''],
  amount_with_space_separator: [2, ' ', ','],
  amount_with_period_and_space_separator: [2, ' ', '.'],
};

function formatAmount(cents, key) {
  const [decimals, thousands, decimal] = AMOUNT_FORMATS[key] ?? AMOUNT_FORMATS.amount;
  const fixed = (Math.abs(cents) / 100).toFixed(decimals);
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
  return `${cents < 0 ? '-' : ''}${grouped}${frac ? decimal + frac : ''}`;
}

/** Formats cents with a Shopify money format such as "{{amount}} NIS" or "₪{{amount_no_decimals}}". */
export function formatMoney(cents, format, { dropZeroDecimals = false } = {}) {
  const value = Math.round(Number(cents));
  if (!Number.isFinite(value)) return '';
  const whole = value % 100 === 0;
  return String(format).replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    let effective = key;
    if (dropZeroDecimals && whole) {
      effective = key
        .replace(/^amount$/, 'amount_no_decimals')
        .replace(/^amount_with_comma_separator$/, 'amount_no_decimals_with_comma_separator')
        .replace(/^amount_with_space_separator$/, 'amount_no_decimals_with_space_separator')
        .replace(/^amount_with_apostrophe_separator$/, 'amount_no_decimals')
        .replace(/^amount_with_period_and_space_separator$/, 'amount_no_decimals_with_space_separator');
    }
    return formatAmount(value, effective);
  });
}

/* ------------------------------------------------------------------------------------------ color */

/** Parses #rgb, #rrggbb, #rrggbbaa, rgb(), rgba(). Returns null for anything else. */
export function parseColor(input) {
  const text = String(input ?? '').trim();
  let match = text.match(/^#([0-9a-f]{3,8})$/i);
  if (match) {
    let hex = match[1];
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join('');
    if (hex.length !== 6 && hex.length !== 8) return null;
    const alpha = hex.length === 8 ? Math.round((parseInt(hex.slice(6, 8), 16) / 255) * 1000) / 1000 : 1;
    return {
      red: parseInt(hex.slice(0, 2), 16),
      green: parseInt(hex.slice(2, 4), 16),
      blue: parseInt(hex.slice(4, 6), 16),
      alpha,
    };
  }
  match = text.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i);
  if (match) {
    let alpha = match[4] === undefined ? 1 : parseFloat(match[4]);
    if (match[4]?.endsWith('%')) alpha /= 100;
    return { red: +match[1], green: +match[2], blue: +match[3], alpha };
  }
  return null;
}

export function rgbToHsl({ red, green, blue }) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { hue: Math.round(h * 360), saturation: Math.round(s * 100), lightness: Math.round(l * 100) };
}

export function hslToRgb({ hue, saturation, lightness }) {
  const h = (((hue % 360) + 360) % 360) / 360;
  const s = Math.min(100, Math.max(0, saturation)) / 100;
  const l = Math.min(100, Math.max(0, lightness)) / 100;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { red: v, green: v, blue: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return {
    red: Math.round(channel(h + 1 / 3) * 255),
    green: Math.round(channel(h) * 255),
    blue: Math.round(channel(h - 1 / 3) * 255),
  };
}

export function toHex({ red, green, blue }) {
  return `#${[red, green, blue].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

export function formatAlpha(alpha) {
  return Number.isInteger(alpha) ? alpha.toFixed(1) : String(alpha);
}

/** Relative luminance (WCAG). */
export function luminance({ red, green, blue }) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(red) + 0.7152 * lin(green) + 0.0722 * lin(blue);
}

export function brightness({ red, green, blue }) {
  return Math.round(((red * 299 + green * 587 + blue * 114) / 1000) * 100) / 100;
}
