// The `t` filter: storefront locale lookup with default-locale fallback, {{ var }} interpolation,
// CLDR pluralisation (Intl.PluralRules) and Shopify's escaping rule (only keys ending in _html are
// output unescaped).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { escapeHtml } from './util.mjs';

const PLURAL_KEYS = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

function isPluralObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0 &&
    Object.keys(value).every((key) => PLURAL_KEYS.has(key))
  );
}

function lookup(data, key) {
  let node = data;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object' || !(part in node)) return undefined;
    node = node[part];
  }
  return node;
}

/** Reads locales/*.json (storefront files only). */
export function loadLocales(themeDir) {
  const dir = path.join(themeDir, 'locales');
  const locales = new Map();
  let defaultLocale = null;
  if (!existsSync(dir)) return { locales, defaultLocale };
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.json') || file.includes('.schema.')) continue;
    const isDefault = file.endsWith('.default.json');
    const code = file.replace(/\.default\.json$|\.json$/, '');
    try {
      locales.set(code, JSON.parse(readFileSync(path.join(dir, file), 'utf8')));
    } catch (error) {
      locales.set(code, {});
      console.warn(`! locales/${file} is not valid JSON: ${error.message}`);
    }
    if (isDefault) defaultLocale = code;
  }
  return { locales, defaultLocale };
}

export class Translator {
  /**
   * @param {{ locales: Map<string, object>, defaultLocale: string | null }} source
   */
  constructor({ locales, defaultLocale }) {
    this.locales = locales;
    this.defaultLocale = defaultLocale;
    this.pluralRules = new Map();
  }

  #plural(locale, count) {
    if (!this.pluralRules.has(locale)) this.pluralRules.set(locale, new Intl.PluralRules(locale));
    return this.pluralRules.get(locale).select(count);
  }

  /**
   * @param {string} locale
   * @param {string} key
   * @param {Record<string, unknown>} vars
   * @param {{ extra?: object | null }} [options] - section-scoped translations (schema "locales")
   * @returns {{ text: string, status: 'ok' | 'fallback' | 'missing', detail?: string }}
   */
  translate(locale, key, vars = {}, { extra = null } = {}) {
    let status = 'ok';
    let value = extra ? lookup(extra, key) : undefined;
    if (value === undefined) value = lookup(this.locales.get(locale) ?? {}, key);
    if (value === undefined && this.defaultLocale && this.defaultLocale !== locale) {
      value = lookup(this.locales.get(this.defaultLocale) ?? {}, key);
      if (value !== undefined) status = 'fallback';
    }
    if (value === undefined || (typeof value === 'object' && !isPluralObject(value))) {
      return { text: `[missing: ${key}]`, status: 'missing' };
    }

    let detail;
    if (isPluralObject(value)) {
      const count = Number(vars.count);
      if (vars.count === undefined || Number.isNaN(count)) {
        detail = `plural key used without a count`;
        value = value.other ?? Object.values(value)[0];
      } else {
        let category = count === 0 && 'zero' in value ? 'zero' : this.#plural(locale, count);
        if (!(category in value)) {
          detail = `no "${category}" form for count ${count}; used "other"`;
          category = 'other';
        }
        value = value[category] ?? '';
      }
    }

    let text = String(value).replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, name) => {
      if (!(name in vars)) {
        detail = `no value passed for {{ ${name} }}`;
        return match;
      }
      const v = vars[name];
      return v === null || v === undefined ? '' : String(v);
    });
    const lastSegment = key.split('.').pop();
    if (!lastSegment.endsWith('_html')) text = escapeHtml(text);
    return { text, status, detail };
  }
}
