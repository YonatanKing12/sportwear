// The LiquidJS engine configured like Shopify: theme files are preprocessed (schema, doc,
// stylesheet and javascript blocks cut out), rendering errors are printed inline as
// "Liquid error (file line N): ..." instead of aborting the page, and Shopify's tags and filters
// are installed.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Liquid, toValue } from 'liquidjs';
import { installFilters } from './filters.mjs';
import { stateOf } from './gaps.mjs';
import { installTags } from './tags.mjs';
import { escapeHtml } from './util.mjs';

const RAW_BLOCK = /\{%(-?)\s*(schema|stylesheet|javascript|doc)\s*(-?)%\}([\s\S]*?)\{%(-?)\s*end\2\s*(-?)%\}/g;

/**
 * Cuts the raw blocks out of a Liquid source. Line numbers are preserved (the removed block is
 * replaced by the same number of newlines inside a comment).
 * @returns {{ source: string, meta: { schema: string | null, stylesheet: string | null, javascript: string | null, duplicates: string[] } }}
 */
export function preprocess(source) {
  const meta = { schema: null, stylesheet: null, javascript: null, duplicates: [] };
  const out = source.replace(RAW_BLOCK, (match, openLeft, name, openRight, body, closeLeft, closeRight) => {
    if (name !== 'doc') {
      if (meta[name] !== null) meta.duplicates.push(name);
      else meta[name] = body;
    }
    // Same whitespace control as the original tags, same number of lines.
    const newlines = '\n'.repeat((match.match(/\n/g) ?? []).length);
    const marker = name === 'stylesheet' || name === 'javascript' ? `{% sw_bundle '${name}' %}` : '';
    return `{%${openLeft} comment %}${newlines}{% endcomment %}${marker}{% comment %}{% endcomment ${closeRight}%}`;
  });
  return { source: out, meta };
}

function stringify(value) {
  const v = toValue(value);
  if (typeof v === 'string') return v;
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(stringify).join('');
  return String(v);
}

class StringEmitter {
  constructor() {
    this.buffer = '';
  }

  write(html) {
    this.buffer += stringify(html);
  }
}

function describeError(themeDir, tpl, error) {
  const token = error?.token ?? tpl?.token;
  const file = token?.file ? path.relative(themeDir, token.file) : null;
  let line = null;
  try {
    line = token?.getPosition?.()[0] ?? null;
  } catch {
    line = null;
  }
  let message = String(error?.originalError?.message ?? error?.message ?? error)
    .split('\n')[0]
    .replace(/, line:\d+, col:\d+$/, '');
  const lookup = message.match(/ENOENT: Failed to lookup "([^"]+)"/);
  if (lookup) message = `Could not find asset snippets/${lookup[1]}.liquid`;
  const where = file ? ` (${file}${line ? ` line ${line}` : ''})` : '';
  return { text: `Liquid error${where}: ${message}`, file, line, message };
}

/**
 * @param {{ themeDir: string }} options
 */
export function createEngine({ themeDir }) {
  const meta = new Map();
  const snippetsDir = path.join(themeDir, 'snippets');
  const fs = {
    exists: async (file) => existsSync(file),
    existsSync: (file) => existsSync(file),
    readFile: async (file) => fs.readFileSync(file),
    readFileSync: (file) => {
      const { source, meta: fileMeta } = preprocess(readFileSync(file, 'utf8'));
      meta.set(file, fileMeta);
      return source;
    },
    resolve: (dir, file, ext) => path.resolve(dir, file.endsWith(ext) ? file : `${file}${ext}`),
    contains: async () => true,
    containsSync: () => true,
    dirname: (file) => path.dirname(file),
    sep: path.sep,
  };

  const liquid = new Liquid({
    root: [snippetsDir],
    partials: [snippetsDir],
    layouts: [path.join(themeDir, 'layout')],
    extname: '.liquid',
    relativeReference: false,
    dynamicPartials: true,
    cache: true,
    fs,
    ownPropertyOnly: true,
    lenientIf: true,
    strictFilters: false,
    strictVariables: false,
    timezoneOffset: 'Asia/Jerusalem',
    dateFormat: '%a, %b %d, %Y, %l:%M %P',
    locale: 'en-US',
  });
  installTags(liquid);
  installFilters(liquid);

  // Shopify keeps rendering after a runtime error and prints "Liquid error (...)" inline.
  liquid.renderer.renderTemplates = function* renderTemplates(templates, ctx, emitter) {
    const out = emitter ?? new StringEmitter();
    for (const tpl of templates) {
      try {
        const html = yield tpl.render(ctx, out);
        if (html) out.write(html);
        if (ctx.breakCalled || ctx.continueCalled) break;
      } catch (error) {
        if (/limit exceeded/i.test(String(error?.message))) throw error;
        const info = describeError(themeDir, tpl, error);
        stateOf(ctx)?.gap('liquid-error', info.text);
        out.write(escapeHtml(info.text));
      }
    }
    return out.buffer;
  };

  const templateCache = new Map();

  /**
   * Parses a theme file (path relative to the theme root). Returns null when it does not exist.
   * @returns {{ templates: any[], meta: object, schema: object | null, schemaError: string | null } | null}
   */
  function loadFile(relative) {
    if (templateCache.has(relative)) return templateCache.get(relative);
    const absolute = path.join(themeDir, relative);
    if (!existsSync(absolute)) {
      templateCache.set(relative, null);
      return null;
    }
    const { source, meta: fileMeta } = preprocess(readFileSync(absolute, 'utf8'));
    meta.set(absolute, fileMeta);
    let schema = null;
    let schemaError = null;
    if (fileMeta.schema !== null) {
      try {
        schema = JSON.parse(fileMeta.schema);
      } catch (error) {
        schemaError = error.message;
      }
    }
    let templates;
    let parseError = null;
    try {
      templates = liquid.parse(source, absolute);
    } catch (error) {
      parseError = describeError(themeDir, null, error).text;
      templates = [];
    }
    const entry = { templates, meta: fileMeta, schema, schemaError, parseError, absolute };
    templateCache.set(relative, entry);
    return entry;
  }

  return {
    liquid,
    loadFile,
    /** Raw schema/stylesheet/javascript of a file seen by the engine (absolute path). */
    metaFor: (absolute) => meta.get(absolute) ?? null,
    describeError: (tpl, error) => describeError(themeDir, tpl, error),
    StringEmitter,
  };
}
