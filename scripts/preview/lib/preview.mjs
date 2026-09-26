// The preview renderer: turns a page spec (template + resource + locale) into full HTML the way
// Shopify's storefront renderer does: JSON template sections in order, section groups, static
// sections, theme blocks, the layout around content_for_layout, and content_for_header with the
// compiled {% stylesheet %}/{% javascript %} bundles.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { Context, toValueSync } from 'liquidjs';
import { BLOG, CART_LINES, COLLECTIONS, LOCALES, PAGES, PRODUCTS, SHOP } from './catalog.mjs';
import { BaseDrop, SettingsDrop } from './drops.mjs';
import { createEngine } from './engine.mjs';
import { CONTAINER, GapLog, STATE } from './gaps.mjs';
import { Translator, loadLocales } from './i18n.mjs';
import { escapeHtml, numericId, shortHash } from './util.mjs';
import { CONTENT_FOR_HEADER_PLACEHOLDER, World, cartJson, productJson } from './world.mjs';

export const PAGE_PRESETS = {
  index: { template: 'index' },
  product: { template: 'product', product: 'demo-fc-home-jersey-2026-27' },
  'product-sale': { template: 'product', product: 'demo-fc-away-jersey-2026-27' },
  'product-kids': { template: 'product', product: 'demo-fc-home-jersey-2026-27-kids' },
  'product-set': { template: 'product', product: 'demo-stars-basketball-jersey-2026-27' },
  // The supplier's size charts: adult jersey (S-XL, L sold out) and kids kit (16-28 with ages, 26 sold out).
  'product-chart': { template: 'product', product: 'demo-united-away-jersey-2026-27' },
  'product-kids-set': { template: 'product', product: 'demo-united-away-kit-2026-27-kids' },
  collection: { template: 'collection', collection: 'football' },
  'collection-empty': { template: 'collection', collection: 'serie-a' },
  'list-collections': { template: 'list-collections' },
  search: { template: 'search', query: { q: 'דמו' } },
  'search-empty': { template: 'search', query: { q: 'zzzz' } },
  cart: { template: 'cart' },
  'cart-empty': { template: 'cart', cart: 'empty' },
  page: { template: 'page', page: 'shipping-returns' },
  404: { template: '404' },
  blog: { template: 'blog', blog: BLOG.handle },
  article: { template: 'article', article: BLOG.articles[0].handle },
  password: { template: 'password' },
  gift_card: { template: 'gift_card' },
};

const CORE_PAGES = [
  'index',
  'product',
  'product-sale',
  'collection',
  'list-collections',
  'search',
  'cart',
  'cart-empty',
  'page',
  '404',
];

/** Parses JSON with Shopify's leading /* ... *\/ comment (and any other comments). */
export function parseJsonc(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === '\\') {
        out += text[i + 1] ?? '';
        i += 1;
      } else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 1;
    } else if (c === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i);
      i = end === -1 ? text.length : end - 1;
    } else out += c;
  }
  return JSON.parse(out);
}

function imageSize(file) {
  const buffer = readFileSync(file);
  if (buffer.subarray(1, 4).toString() === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length) {
      const marker = buffer.readUInt16BE(offset);
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xffc0 && marker <= 0xffcf && ![0xffc4, 0xffc8, 0xffcc].includes(marker)) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
  }
  const text = buffer.subarray(0, 2000).toString();
  const svg = text.match(/<svg[^>]*?width="(\d+)[^"]*"[^>]*?height="(\d+)/);
  if (svg) return { width: Number(svg[1]), height: Number(svg[2]) };
  const box = text.match(/viewBox="[\d.\s-]*?\s([\d.]+)\s+([\d.]+)"/);
  if (box) return { width: Math.round(Number(box[1])), height: Math.round(Number(box[2])) };
  return { width: 1200, height: 1500 };
}

function missingImageSvg(name) {
  const label = escapeHtml(name.length > 48 ? `${name.slice(0, 45)}…` : name);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><defs><pattern id="s" width="48" height="48" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="24" height="48" fill="#ffd43b"/></pattern></defs><rect width="1200" height="800" fill="#fff3bf"/><rect width="1200" height="800" fill="url(#s)" opacity=".45"/><rect x="200" y="300" width="800" height="200" fill="#fff3bf"/><text x="600" y="385" font-family="monospace" font-size="40" text-anchor="middle" fill="#5f3dc4">preview: image not available</text><text x="600" y="445" font-family="monospace" font-size="30" text-anchor="middle" fill="#212529">${label}</text></svg>`;
}

function markerBox(title, detail) {
  return `<div class="sw-preview-marker" data-sw-preview-marker style="margin:12px;padding:12px 16px;border:3px dashed #d9480f;background:#fff4e6;color:#1a1a1a;font:600 14px/1.5 monospace;direction:ltr;text-align:left">[preview] ${escapeHtml(title)}${detail ? `<br><span style="font-weight:400">${escapeHtml(detail)}</span>` : ''}</div>`;
}

/* --------------------------------------------------------------------------------- Preview */

export class Preview {
  /**
   * @param {object} options
   * @param {string} options.themeDir
   * @param {string} options.fixturesDir
   * @param {string} [options.moneyFormat]
   * @param {string} [options.moneyWithCurrencyFormat]
   * @param {boolean} [options.editorAttributes] - output block.shopify_attributes (default true)
   */
  constructor(options) {
    this.options = { editorAttributes: true, ...options };
    this.themeDir = path.resolve(options.themeDir);
    this.fixturesDir = path.resolve(options.fixturesDir);
    this.engine = createEngine({ themeDir: this.themeDir });
    const locales = loadLocales(this.themeDir);
    this.translator = new Translator(locales);
    this.themeLocales = [...locales.locales.keys()];
    this.defaultLocale = locales.defaultLocale;
    this.themeSettings = this.#loadThemeSettings();
    this.fixtureImages = this.#loadFixtureImages();
    /** url → { type, content }: compiled bundles and marker images (can be shared between instances) */
    this.generatedFiles = options.generatedFiles ?? new Map();
    this.assetHashes = new Map();
    this.allGaps = new Map();
  }

  #loadThemeSettings() {
    const schemaFile = path.join(this.themeDir, 'config/settings_schema.json');
    const dataFile = path.join(this.themeDir, 'config/settings_data.json');
    const schema = existsSync(schemaFile) ? parseJsonc(readFileSync(schemaFile, 'utf8')) : [];
    const raw = existsSync(dataFile) ? parseJsonc(readFileSync(dataFile, 'utf8')) : {};
    let data = raw.current ?? {};
    if (typeof data === 'string') data = raw.presets?.[data] ?? {};
    return { schema, data };
  }

  #loadFixtureImages() {
    const dir = path.join(this.fixturesDir, 'images');
    const images = new Map();
    if (!existsSync(dir)) return images;
    for (const file of readdirSync(dir).sort()) {
      if (!/\.(png|jpe?g|svg|webp|gif)$/i.test(file)) continue;
      images.set(file, { file, ...imageSize(path.join(dir, file)) });
    }
    return images;
  }

  /** Registers a generated "missing image" SVG and returns its image info. */
  missingImage(name) {
    const file = `__missing/${shortHash(name)}.svg`;
    const url = `/files/${file}`;
    if (!this.generatedFiles.has(url)) {
      this.generatedFiles.set(url, { type: 'image/svg+xml', content: missingImageSvg(name) });
    }
    return { file, width: 1200, height: 800, url };
  }

  assetUrl(name, gap) {
    const file = path.join(this.themeDir, 'assets', name);
    if (!this.assetHashes.has(name)) {
      let hash = null;
      if (existsSync(file)) {
        const stat = statSync(file);
        hash = shortHash(`${stat.size}:${stat.mtimeMs}`, 8);
      } else if (existsSync(`${file}.liquid`)) {
        hash = 'liquid';
      }
      this.assetHashes.set(name, hash);
    }
    const hash = this.assetHashes.get(name);
    if (hash === null) gap?.('missing-file', `asset_url: assets/${name} does not exist`);
    if (hash === 'liquid') gap?.('unsupported', `assets/${name}.liquid is served unrendered by the preview`);
    return `/assets/${name}?v=${hash ?? 'missing'}`;
  }

  assetContent(name) {
    const file = path.join(this.themeDir, 'assets', name);
    return existsSync(file) ? readFileSync(file, 'utf8') : null;
  }

  /** Storefront languages of the store (he primary, en, ar). */
  get locales() {
    return LOCALES.map((l) => l.iso_code);
  }

  findTemplate(name) {
    for (const ext of ['json', 'liquid']) {
      const relative = `templates/${name}.${ext}`;
      const file = path.join(this.themeDir, relative);
      if (existsSync(file)) return { kind: ext, relative, file };
    }
    return null;
  }

  /** Pages rendered when none are given: core pages plus any alternate templates the theme has. */
  defaultPages() {
    const pages = [...CORE_PAGES];
    const dir = path.join(this.themeDir, 'templates');
    if (!existsSync(dir)) return pages;
    for (const file of readdirSync(dir).sort()) {
      const match = file.match(/^(page|product|collection|blog|article)\.([\w-]+)\.(json|liquid)$/);
      if (match) pages.push(`${match[1]}.${match[2]}`);
    }
    for (const name of ['blog', 'article', 'password']) if (this.findTemplate(name)) pages.push(name);
    return pages;
  }

  /**
   * Page id → spec. Ids: a preset name (see PAGE_PRESETS), `<template>.<suffix>` for alternate
   * templates, or `product:<handle>`, `collection:<handle>`, `page:<handle>`, `search:<terms>`;
   * any id can end with ?query (e.g. `collection:football?sort_by=price-ascending&page=2`).
   */
  pageSpec(id, locale = 'he') {
    const [base, queryString = ''] = String(id).split('?');
    const query = {};
    for (const [key, value] of new URLSearchParams(queryString)) {
      if (key in query) query[key] = [].concat(query[key], value);
      else query[key] = value;
    }
    let spec;
    const typed = base.match(/^(product|collection|page|search|article):(.+)$/);
    const alternate = base.match(/^(page|product|collection|blog|article)\.([\w-]+)$/);
    if (PAGE_PRESETS[base]) {
      spec = { ...PAGE_PRESETS[base], query: { ...(PAGE_PRESETS[base].query ?? {}), ...query } };
    } else if (typed) {
      const [, kind, value] = typed;
      spec =
        kind === 'search'
          ? { template: 'search', query: { ...query, q: value } }
          : { template: kind, [kind]: value, query };
      const lists = { product: PRODUCTS, collection: COLLECTIONS, page: PAGES, article: BLOG.articles };
      if (lists[kind] && !lists[kind].some((item) => item.handle === value)) {
        throw new Error(`No mock ${kind} "${value}". Handles: ${lists[kind].map((item) => item.handle).join(', ')}`);
      }
    } else if (alternate) {
      const [, template, suffix] = alternate;
      spec = { ...PAGE_PRESETS[template], template, suffix, query };
      if (template === 'page' && PAGES.some((p) => p.handle === suffix)) spec.page = suffix;
    } else {
      throw new Error(
        `Unknown page "${id}". Use one of: ${Object.keys(PAGE_PRESETS).join(', ')}, or product:<handle>…`,
      );
    }
    spec.id = id;
    spec.locale = locale;
    spec.pageType = {
      index: 'index',
      product: 'product',
      collection: 'collection',
      'list-collections': 'list-collections',
      search: 'search',
      cart: 'cart',
      page: 'page',
      404: '404',
      blog: 'blog',
      article: 'article',
      password: 'password',
      gift_card: 'gift_card',
    }[spec.template];
    spec.path =
      {
        index: '/',
        product: `/products/${spec.product}`,
        collection: `/collections/${spec.collection}`,
        'list-collections': '/collections',
        search: '/search',
        cart: '/cart',
        page: `/pages/${spec.page}`,
        404: '/pages/qa-page-that-does-not-exist',
        blog: `/blogs/${BLOG.handle}`,
        article: `/blogs/${BLOG.handle}/${spec.article}`,
        password: '/password',
        gift_card: '/gift_cards/demo',
      }[spec.template] ?? '/';
    if (spec.product && !PRODUCTS.some((p) => p.handle === spec.product)) {
      throw new Error(`No mock product "${spec.product}". Handles: ${PRODUCTS.map((p) => p.handle).join(', ')}`);
    }
    return spec;
  }

  /** File name for a page id (ids may contain : ? & =). */
  static fileName(id) {
    return `${String(id)
      .replace(/[^\w.-]+/g, '-')
      .replace(/-+$/, '')}.html`;
  }

  #newState(spec, cartLines) {
    const lines = cartLines ?? (spec.cart === 'empty' ? [] : CART_LINES);
    return new PageState(this, spec, lines);
  }

  /**
   * Renders a full page.
   * @returns {{ html: string, gaps: object[], sections: string[] }}
   */
  renderPage(spec, { cartLines } = {}) {
    const state = this.#newState(spec, cartLines);
    const html = toValueSync(state.renderPage());
    this.#collectGaps(state, spec);
    return { html, gaps: state.gaps.list(), sections: state.renderedSections };
  }

  /**
   * Section Rendering API: renders sections by id for a page.
   * @returns {Record<string, string | null>}
   */
  renderSections(spec, ids, { cartLines, extra } = {}) {
    const state = this.#newState(spec, cartLines);
    if (extra) Object.assign(state.baseGlobals, extra(state.world));
    const out = {};
    for (const id of ids) out[id] = toValueSync(state.renderSectionById(id));
    this.#collectGaps(state, spec);
    // Not part of the JSON: the server reports these in a response header.
    Object.defineProperty(out, 'gaps', { value: state.gaps.list(), enumerable: false });
    return out;
  }

  /** A World for API responses (cart JSON, product JSON...). */
  world(spec, cartLines) {
    return this.#newState(spec, cartLines).world;
  }

  #collectGaps(state, spec) {
    for (const gap of state.gaps.list()) {
      const key = `${gap.kind}|${gap.message}`;
      const entry = this.allGaps.get(key) ?? { kind: gap.kind, message: gap.message, where: [], pages: [] };
      for (const where of gap.where) if (!entry.where.includes(where)) entry.where.push(where);
      const page = `${spec.locale}/${spec.id}`;
      if (!entry.pages.includes(page)) entry.pages.push(page);
      this.allGaps.set(key, entry);
    }
  }

  /** Maps a storefront URL (/en/products/x?variant=1) to a page spec, or null (404). */
  resolveRequest(pathname, searchParams) {
    const segments = pathname.split('/').filter(Boolean);
    let locale = LOCALES.find((l) => l.primary).iso_code;
    if (segments.length && LOCALES.some((l) => !l.primary && l.iso_code === segments[0])) locale = segments.shift();
    const [first, second, third, fourth] = segments;
    const known = (list, handle) => list.some((item) => item.handle === handle);
    let id = null;
    if (!first) id = 'index';
    else if (first === 'products' && known(PRODUCTS, second) && !third) id = `product:${second}`;
    else if (first === 'collections' && !second) id = 'list-collections';
    else if (first === 'collections' && third === 'products' && known(PRODUCTS, fourth)) id = `product:${fourth}`;
    else if (first === 'collections' && known(COLLECTIONS, second) && !third) id = `collection:${second}`;
    else if (first === 'cart' && !second) id = 'cart';
    else if (first === 'search' && !second) id = 'search';
    else if (first === 'pages' && known(PAGES, second)) id = `page:${second}`;
    else if (first === 'blogs' && second === BLOG.handle && !third) id = 'blog';
    else if (first === 'blogs' && second === BLOG.handle && known(BLOG.articles, third)) id = `article:${third}`;
    else if (first === 'password') id = 'password';
    if (!id) return null;
    const spec = this.pageSpec(id, locale);
    if (id === 'search') spec.query = {};
    for (const [key, value] of searchParams) {
      if (key === 'section_id' || key === 'sections') continue;
      spec.query[key] = key in spec.query && key !== 'q' ? [].concat(spec.query[key], value) : value;
    }
    return spec;
  }

  cartJson(world) {
    return cartJson(world.cart);
  }

  productJson(world, handle) {
    const product = world.product(handle);
    return product ? productJson(product) : null;
  }
}

/* ------------------------------------------------------------------------------- PageState */

class PageState {
  constructor(preview, spec, cartLines) {
    this.preview = preview;
    this.spec = spec;
    this.locale = spec.locale;
    this.translator = preview.translator;
    this.gaps = new GapLog();
    this.fileStack = [];
    this.bundles = { stylesheet: new Map(), javascript: new Map() };
    this.imageUrls = new Map();
    this.preloads = [];
    this.layout = undefined;
    this.sectionLocales = null;
    this.renderedSections = [];
    this.world = new World({ preview, locale: spec.locale, spec, cartLines, gap: (k, m) => this.gap(k, m) });
    this.baseGlobals = this.world.buildGlobals();
    this.baseGlobals[STATE] = this;
    this.defaultClosest = new BaseDrop('closest', {
      product: this.baseGlobals.product ?? null,
      collection: this.baseGlobals.collection ?? null,
      page: this.baseGlobals.page ?? null,
      blog: this.baseGlobals.blog ?? null,
      article: this.baseGlobals.article ?? null,
      metaobject: null,
    });
    const liquidFor = preview.engine.liquid;
    this.liquid = liquidFor;
    const templateName = spec.suffix ? `${spec.template}.${spec.suffix}` : spec.template;
    this.templateName = templateName;
    this.templateNumber = numericId(`template:${templateName}`, 20260926000000);
  }

  gap(kind, message) {
    this.gaps.add(kind, message, this.fileStack[this.fileStack.length - 1]);
  }

  setLayout(name) {
    this.layout = name;
  }

  collectBundle(kind, absoluteFile) {
    const meta = this.preview.engine.metaFor(absoluteFile);
    const code = meta?.[kind];
    const relative = path.relative(this.preview.themeDir, absoluteFile);
    if (meta?.duplicates?.includes(kind)) {
      this.gap('liquid-error', `${relative} has more than one {% ${kind} %} tag (Shopify rejects this)`);
    }
    if (code && !this.bundles[kind].has(relative)) this.bundles[kind].set(relative, code);
  }

  childGlobals(extra) {
    return this.world.wrapGlobals({ ...this.baseGlobals, ...extra, [STATE]: this });
  }

  newContext(globals) {
    return new Context({}, this.liquid.options, { globals, sync: true }, { liquid: this.liquid });
  }

  /** Evaluates dynamic sources in settings ("{{ closest.product }}", "<p>{{ product.title }}</p>"). */
  evaluator(closest) {
    return (source, exact) => {
      const ctx = this.newContext(this.childGlobals({ closest }));
      try {
        if (exact) return this.liquid.evalValueSync(source, ctx);
        return toValueSync(this.liquid.renderer.renderTemplates(this.liquid.parse(source), ctx));
      } catch (error) {
        this.gap('liquid-error', `dynamic source "${source}" failed: ${error.message}`);
        return null;
      }
    };
  }

  resolveSettings(definitions, raw, owner, closest) {
    const values = {};
    const evaluate = this.evaluator(closest ?? this.defaultClosest);
    const known = new Set();
    for (const def of definitions ?? []) {
      if (!def.id) continue;
      known.add(def.id);
      values[def.id] = this.world.resolveSetting(def, raw?.[def.id], owner, evaluate);
    }
    for (const id of Object.keys(raw ?? {})) {
      if (!known.has(id))
        this.gap('setting', `${owner}: JSON sets "${id}", which its schema does not define (ignored)`);
    }
    return new SettingsDrop(owner, values);
  }

  /* ------------------------------------------------------------------------------ blocks */

  buildBlocks(rawContainer, containerSchema, ownerFile) {
    const blocks = rawContainer?.blocks ?? {};
    const order = rawContainer?.block_order ?? Object.keys(blocks);
    const list = [];
    for (const id of order) {
      const raw = blocks[id];
      if (!raw) {
        this.gap('schema', `${ownerFile}: block_order lists "${id}" but there is no such block`);
        continue;
      }
      if (raw.disabled || raw.static) continue;
      const drop = this.buildBlockDrop(id, raw, containerSchema, ownerFile);
      if (drop) list.push(drop);
    }
    return list;
  }

  buildBlockDrop(id, raw, containerSchema, ownerFile, closest) {
    const type = String(raw.type ?? '');
    if (type.startsWith('shopify://apps') || type === '@app') {
      this.gap('unsupported', `${ownerFile}: app block "${type}" is not rendered by the preview`);
      return null;
    }
    const local = (containerSchema?.blocks ?? []).find((b) => b.type === type && b.name);
    let definitions = [];
    let isTheme = false;
    let blockSchema = null;
    if (local) {
      definitions = local.settings ?? [];
    } else {
      const loaded = this.preview.engine.loadFile(`blocks/${type}.liquid`);
      if (loaded) {
        isTheme = true;
        blockSchema = loaded.schema ?? {};
        definitions = blockSchema.settings ?? [];
      } else {
        this.gap(
          'missing-file',
          `${ownerFile}: block type "${type}" has no local definition and no blocks/${type}.liquid`,
        );
      }
    }
    const owner = `block ${type} (${id}) in ${ownerFile}`;
    const settings = this.resolveSettings(definitions, raw.settings, owner, closest);
    const attributes = this.preview.options.editorAttributes
      ? `data-shopify-editor-block="${escapeHtml(JSON.stringify({ id, type }))}"`
      : '';
    const children = isTheme ? this.buildBlocks(raw, blockSchema, `blocks/${type}.liquid`) : [];
    return new BaseDrop(
      'block',
      { id, type, settings, shopify_attributes: attributes },
      { __raw: raw, __theme: isTheme, __schema: blockSchema, __children: children },
    );
  }

  *renderBlocks(container, args) {
    if (!container) {
      this.gap('unsupported', "content_for 'blocks' used outside a section or theme block");
      return '';
    }
    const closest = this.#closest(container.closest, args);
    let html = '';
    for (const block of container.blocks) {
      if (!block.__theme) continue;
      html += yield* this.#renderThemeBlock(block, container, closest, {});
    }
    return html;
  }

  *renderStaticBlock(container, args) {
    const type = args.type;
    const id = args.id;
    if (!type || !id) {
      this.gap('liquid-error', "content_for 'block' needs both type and id");
      return '';
    }
    if (!container) {
      this.gap('unsupported', "content_for 'block' used outside a section or theme block");
      return '';
    }
    const raw = container.raw?.blocks?.[id] ?? { type, settings: {} };
    if (raw.type && raw.type !== type) {
      this.gap('schema', `static block "${id}" has type "${raw.type}" in JSON but "${type}" in Liquid`);
    }
    const closest = this.#closest(container.closest, args);
    const block = this.buildBlockDrop(id, { ...raw, type }, null, container.file, closest);
    if (!block) return '';
    if (!block.__theme) return markerBox(`static block type "${type}" has no blocks/${type}.liquid`);
    const extras = {};
    for (const [key, value] of Object.entries(args)) {
      if (key !== 'type' && key !== 'id' && !key.startsWith('closest.')) extras[key] = value;
    }
    return yield* this.#renderThemeBlock(block, container, closest, extras);
  }

  #closest(parent, args) {
    const values = { ...(parent ?? this.defaultClosest) };
    for (const [key, value] of Object.entries(args ?? {})) {
      if (key.startsWith('closest.')) values[key.split('.')[1]] = value;
    }
    return new BaseDrop('closest', values);
  }

  *#renderThemeBlock(block, parent, closest, extras) {
    const file = `blocks/${block.type}.liquid`;
    const loaded = this.preview.engine.loadFile(file);
    if (loaded.parseError) {
      this.gap('liquid-error', loaded.parseError);
      return markerBox(loaded.parseError);
    }
    if (loaded.schemaError) this.gap('schema', `${file}: invalid schema JSON (${loaded.schemaError})`);
    const schema = loaded.schema ?? {};
    const container = {
      kind: 'block',
      section: parent.section,
      block,
      blocks: block.__children,
      raw: block.__raw,
      closest,
      file,
    };
    const globals = this.childGlobals({ ...extras, section: parent.section, block, closest, [CONTAINER]: container });
    this.fileStack.push(file);
    let inner;
    try {
      inner = yield this.liquid.renderer.renderTemplates(loaded.templates, this.newContext(globals));
    } finally {
      this.fileStack.pop();
    }
    if (schema.tag === null) return inner;
    const tag = schema.tag || 'div';
    const classes = ['shopify-block', schema.class].filter(Boolean).join(' ');
    return `<${tag} id="shopify-block-${escapeHtml(block.id)}" class="${escapeHtml(classes)}">${inner}</${tag}>`;
  }

  /* ---------------------------------------------------------------------------- sections */

  *renderSection(instance) {
    const { id, type, data } = instance;
    const file = `sections/${type}.liquid`;
    const loaded = this.preview.engine.loadFile(file);
    if (!loaded) {
      this.gap('missing-file', `${file} does not exist (used by ${instance.origin})`);
      return markerBox(`missing section file ${file}`, `used by ${instance.origin}`);
    }
    if (loaded.parseError) {
      this.gap('liquid-error', loaded.parseError);
      return markerBox(loaded.parseError);
    }
    if (loaded.schemaError) this.gap('schema', `${file}: invalid schema JSON (${loaded.schemaError})`);
    else if (!loaded.schema) this.gap('schema', `${file} has no {% schema %}`);
    const schema = loaded.schema ?? {};
    const owner = `section ${type} (${id})`;
    const settings = this.resolveSettings(schema.settings, data.settings, owner);
    const blocks = this.buildBlocks(data, schema, file);
    const section = new BaseDrop('section', {
      id,
      settings,
      blocks,
      block_order: blocks.map((b) => b.id),
      index: instance.index ?? null,
      index0: instance.index ? instance.index - 1 : null,
      location: instance.location,
    });
    const container = { kind: 'section', section, blocks, raw: data, closest: this.defaultClosest, file };
    const globals = this.childGlobals({ section, [CONTAINER]: container });
    const previousLocales = this.sectionLocales;
    const sectionLocales = schema.locales?.[this.locale] ?? schema.locales?.[this.preview.defaultLocale];
    this.sectionLocales = sectionLocales ? { sections: { [type]: sectionLocales } } : null;
    this.fileStack.push(file);
    let inner;
    try {
      inner = yield this.liquid.renderer.renderTemplates(loaded.templates, this.newContext(globals));
    } finally {
      this.fileStack.pop();
      this.sectionLocales = previousLocales;
    }
    this.renderedSections.push(id);
    const tag = schema.tag || 'div';
    const classes = ['shopify-section', instance.groupClass, schema.class].filter(Boolean).join(' ');
    const customCss =
      Array.isArray(data.custom_css) && data.custom_css.length
        ? `<style data-shopify>#shopify-section-${id}{${data.custom_css.join('\n')}}</style>`
        : '';
    return `<${tag} id="shopify-section-${escapeHtml(id)}" class="${escapeHtml(classes)}">${customCss}${inner}</${tag}>`;
  }

  #readJson(relative) {
    const file = path.join(this.preview.themeDir, relative);
    if (!existsSync(file)) return { missing: true };
    try {
      return { data: parseJsonc(readFileSync(file, 'utf8')) };
    } catch (error) {
      this.gap('schema', `${relative} is not valid JSON (${error.message})`);
      return { data: null };
    }
  }

  #groupInstances(name) {
    const relative = `sections/${name}.json`;
    const { missing, data } = this.#readJson(relative);
    if (missing) {
      this.gap('missing-file', `${relative} does not exist ({% sections '${name}' %})`);
      return [];
    }
    if (!data) return [];
    const number = numericId(`group:${name}`, 20260926100000);
    const instances = [];
    let index = 0;
    for (const key of data.order ?? Object.keys(data.sections ?? {})) {
      const entry = data.sections?.[key];
      if (!entry) {
        this.gap('schema', `${relative}: order lists "${key}" but there is no such section`);
        continue;
      }
      if (entry.disabled) continue;
      index += 1;
      instances.push({
        id: `sections--${number}__${key}`,
        key,
        type: entry.type,
        data: entry,
        location: data.type ?? name,
        index,
        groupClass: `shopify-section-group-${name}`,
        origin: relative,
      });
    }
    return instances;
  }

  *renderSectionGroup(name) {
    let html = '';
    for (const instance of this.#groupInstances(name)) html += yield* this.renderSection(instance);
    return html;
  }

  #staticInstance(name, id = name) {
    const stored = this.preview.themeSettings.data.sections?.[name];
    const loaded = this.preview.engine.loadFile(`sections/${name}.liquid`);
    let data = stored ?? {};
    if (!stored && loaded?.schema?.default) {
      const def = loaded.schema.default;
      const blocks = {};
      const order = [];
      (def.blocks ?? []).forEach((block, i) => {
        const blockId = `${block.type}-${i + 1}`;
        blocks[blockId] = block;
        order.push(blockId);
      });
      data = { settings: def.settings ?? {}, blocks, block_order: order };
    }
    return { id, key: name, type: name, data, location: 'static', index: null, origin: `{% section '${name}' %}` };
  }

  *renderStaticSection(name) {
    return yield* this.renderSection(this.#staticInstance(name));
  }

  #templateInstances(data) {
    const instances = [];
    let index = 0;
    for (const key of data.order ?? Object.keys(data.sections ?? {})) {
      const entry = data.sections?.[key];
      if (!entry) {
        this.gap('schema', `templates/${this.templateName}.json: order lists "${key}" but there is no such section`);
        continue;
      }
      if (entry.disabled) continue;
      index += 1;
      instances.push({
        id: `template--${this.templateNumber}__${key}`,
        key,
        type: entry.type,
        data: entry,
        location: 'template',
        index,
        origin: `templates/${this.templateName}.json`,
      });
    }
    return instances;
  }

  /** Section Rendering API lookup: template sections, group sections, then section files. */
  *renderSectionById(id) {
    const template = this.preview.findTemplate(this.templateName);
    const candidates = [];
    if (template?.kind === 'json') {
      const { data } = this.#readJson(template.relative);
      if (data) candidates.push(...this.#templateInstances(data));
    }
    for (const group of ['header-group', 'footer-group', 'overlay-group']) {
      if (existsSync(path.join(this.preview.themeDir, `sections/${group}.json`))) {
        candidates.push(...this.#groupInstances(group));
      }
    }
    const found = candidates.find((c) => c.id === id) ?? candidates.find((c) => c.key === id);
    if (found) {
      found.index = null;
      return yield* this.renderSection(found);
    }
    if (this.preview.engine.loadFile(`sections/${id}.liquid`)) {
      return yield* this.renderSection(this.#staticInstance(id));
    }
    return null;
  }

  /* -------------------------------------------------------------------------------- page */

  *renderPage() {
    const spec = this.spec;
    const template = this.preview.findTemplate(this.templateName);
    let content = '';
    let layout = 'theme';
    if (!template) {
      this.gap(
        'missing-file',
        `templates/${this.templateName}.json does not exist; the layout was rendered with an empty template`,
      );
      content = markerBox(
        `templates/${this.templateName}.json does not exist yet`,
        'layout rendered with an empty template',
      );
    } else if (template.kind === 'json') {
      const { data } = this.#readJson(template.relative);
      if (data) {
        layout = data.layout === false ? null : (data.layout ?? 'theme');
        let html = '';
        for (const instance of this.#templateInstances(data)) html += yield* this.renderSection(instance);
        if (data.wrapper) html = wrapTemplate(data.wrapper, html);
        content = html;
      }
    } else {
      const loaded = this.preview.engine.loadFile(template.relative);
      this.fileStack.push(template.relative);
      try {
        content = yield this.liquid.renderer.renderTemplates(loaded.templates, this.newContext(this.childGlobals({})));
      } finally {
        this.fileStack.pop();
      }
      layout = this.layout === undefined ? 'theme' : this.layout;
    }
    if (spec.template === 'password' && template?.kind === 'json' && layout === 'theme') {
      // Shopify renders the password template with layout/password.liquid unless it says otherwise.
      layout = existsSync(path.join(this.preview.themeDir, 'layout/password.liquid')) ? 'password' : 'theme';
    }

    let html = content;
    if (layout) {
      const relative = `layout/${layout}.liquid`;
      const loaded = this.preview.engine.loadFile(relative);
      if (!loaded) {
        this.gap('missing-file', `${relative} does not exist`);
      } else if (loaded.parseError) {
        this.gap('liquid-error', loaded.parseError);
        html = markerBox(loaded.parseError);
      } else {
        this.fileStack.push(relative);
        try {
          html = yield this.liquid.renderer.renderTemplates(
            loaded.templates,
            this.newContext(this.childGlobals({ content_for_layout: content })),
          );
        } finally {
          this.fileStack.pop();
        }
      }
    }
    return this.#finish(html);
  }

  #compiled(kind) {
    const entries = [...this.bundles[kind].entries()];
    if (!entries.length) return null;
    const content =
      kind === 'stylesheet'
        ? entries.map(([file, css]) => `/* ${file} */\n${css.trim()}\n`).join('\n')
        : entries
            .map(
              ([file, js]) =>
                `/* ${file} */\n(function() {\n  try {\n${js.trim()}\n  } catch (e) {\n    console.error(e);\n  }\n})();\n`,
            )
            .join('\n');
    const ext = kind === 'stylesheet' ? 'css' : 'js';
    const url = `/compiled_assets/${kind === 'stylesheet' ? 'styles' : 'scripts'}-${shortHash(content)}.${ext}`;
    this.preview.generatedFiles.set(url, {
      type: kind === 'stylesheet' ? 'text/css' : 'text/javascript',
      content,
    });
    return url;
  }

  #contentForHeader() {
    const world = this.world;
    const root = world.root ? `${world.root}/` : '/';
    const shopify = {
      shop: SHOP.domain,
      locale: this.locale,
      currency: { active: SHOP.currency, rate: '1.0' },
      country: 'IL',
      theme: { name: 'SportWear (preview)', id: 1, role: 'unpublished' },
      routes: { root },
      cdnHost: '/cdn',
    };
    const lines = [
      `<script id="sw-preview-shopify">window.Shopify = window.Shopify || {}; Object.assign(window.Shopify, ${JSON.stringify(shopify).replace(/</g, '\\u003c')});</script>`,
    ];
    const pathWithoutLocale = world.path === '/' ? '' : world.path;
    for (const locale of LOCALES) {
      const prefix = locale.primary ? '' : `/${locale.iso_code}`;
      lines.push(
        `<link rel="alternate" hreflang="${locale.iso_code}" href="${SHOP.url}${prefix}${pathWithoutLocale || (prefix ? '' : '/')}">`,
      );
    }
    lines.push(`<link rel="alternate" hreflang="x-default" href="${SHOP.url}${pathWithoutLocale || '/'}">`);
    for (const preload of this.preloads) {
      lines.push(
        `<link rel="preload" data-sw-preview="preload-header"${Object.entries(preload)
          .filter(([, v]) => v)
          .map(([k, v]) => ` ${k}="${escapeHtml(v)}"`)
          .join('')}>`,
      );
    }
    const css = this.#compiled('stylesheet');
    if (css) lines.push(`<link rel="stylesheet" href="${css}" media="all" data-sw-preview="compiled-stylesheets">`);
    const js = this.#compiled('javascript');
    if (js) lines.push(`<script src="${js}" defer="defer" data-sw-preview="compiled-javascript"></script>`);
    return lines.join('\n');
  }

  #finish(html) {
    let out = html;
    if (out.includes(CONTENT_FOR_HEADER_PLACEHOLDER)) {
      const header = this.#contentForHeader();
      out = out.replace(CONTENT_FOR_HEADER_PLACEHOLDER, () => header);
      out = out.split(CONTENT_FOR_HEADER_PLACEHOLDER).join('');
    } else {
      this.gap('liquid-error', 'the layout never outputs {{ content_for_header }} (Shopify requires it)');
      this.#contentForHeader();
    }
    const gaps = this.gaps.list();
    if (!gaps.length) return out;
    const items = gaps
      .slice(0, 60)
      .map(
        (g) =>
          `<li style="margin:2px 0"><b>[${escapeHtml(g.kind)}]</b> ${escapeHtml(g.message)}${g.where.length ? ` <i style="color:#555">(${escapeHtml(g.where.join(', '))})</i>` : ''}${g.count > 1 ? ` ×${g.count}` : ''}</li>`,
      )
      .join('');
    const more = gaps.length > 60 ? `<p>…and ${gaps.length - 60} more (see render-report.json)</p>` : '';
    const banner = `<div class="sw-preview-gaps" data-sw-preview-gaps="${gaps.length}" lang="en" dir="ltr" style="all:initial;display:block;box-sizing:border-box;width:100%;padding:16px 20px;background:#fff3bf;color:#1a1a1a;border-top:6px solid #e8590c;font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;text-align:left"><p style="margin:0 0 6px;font-weight:700;font-size:14px">Preview harness: ${gaps.length} gap(s) on this page. These come from the local preview, not from Shopify; see qa-output/preview/render-report.json.</p><ol style="margin:0;padding-left:22px">${items}</ol>${more}</div>`;
    const script = `<script data-sw-preview="gaps">(function(){var gaps=${JSON.stringify(gaps.map((g) => `[${g.kind}] ${g.message}${g.where.length ? ` (${g.where.join(', ')})` : ''}`)).replace(/</g, '\\u003c')};for(var i=0;i<gaps.length;i++){console.warn('[preview-gap] '+gaps[i]);}})();</script>`;
    const insert = `${banner}${script}`;
    const index = out.lastIndexOf('</body>');
    return index === -1 ? `${out}${insert}` : `${out.slice(0, index)}${insert}${out.slice(index)}`;
  }
}

function wrapTemplate(wrapper, html) {
  const match = String(wrapper).match(/^([a-z]+)((?:[#.][\w-]+)*)((?:\[[^\]]+\])*)$/i);
  if (!match) return html;
  const [, tag, selectors, attributes] = match;
  const id = selectors.match(/#([\w-]+)/)?.[1];
  const classes = [...selectors.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  const extra = [...attributes.matchAll(/\[([\w-]+)=([^\]]*)\]/g)].map(
    ([, key, value]) => ` ${key}="${escapeHtml(value)}"`,
  );
  return `<${tag}${id ? ` id="${id}"` : ''}${classes.length ? ` class="${classes.join(' ')}"` : ''}${extra.join('')}>${html}</${tag}>`;
}

export async function createPreview(options) {
  return new Preview(options);
}
