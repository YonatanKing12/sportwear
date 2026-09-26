// Tiny HTTP server for the rendered preview (node:http, no dependencies).
// Serves the static output of render.mjs, and answers the storefront endpoints theme JavaScript
// calls, so pages behave as they would on Shopify:
//   - Section Rendering API: any page URL with ?section_id= or ?sections=
//   - Cart AJAX API: /cart.js, /cart/add(.js), /cart/change(.js), /cart/update(.js), /cart/clear(.js)
//   - /products/<handle>.js, /search/suggest (predictive search), /recommendations/products
//   - storefront URLs (/, /en, /products/<handle>, /collections/<handle>, ...) rendered on demand
//   - POST /localization (the language switcher form) redirects to the chosen language
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { CART_LINES, LOCALES } from './catalog.mjs';
import { Preview } from './preview.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/** Parses JSON, urlencoded and multipart bodies into [key, value] pairs. */
function parseBody(buffer, contentType = '') {
  const text = buffer.toString('utf8');
  if (contentType.includes('application/json')) {
    try {
      return { json: JSON.parse(text || '{}'), pairs: [] };
    } catch {
      return { json: {}, pairs: [] };
    }
  }
  if (contentType.includes('multipart/form-data')) {
    const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
    const marker = `--${boundary?.[1] ?? boundary?.[2]}`;
    const pairs = [];
    for (const part of text.split(marker)) {
      const match = part.match(/name="([^"]+)"[^\r\n]*\r?\n(?:[^\r\n]+\r?\n)*\r?\n([\s\S]*?)\r?\n?$/);
      if (match) pairs.push([match[1], match[2].replace(/\r?\n$/, '')]);
    }
    return { json: null, pairs };
  }
  return { json: null, pairs: [...new URLSearchParams(text)] };
}

/** Turns form pairs (items[][id], updates[123]) into an object like Rails would. */
function pairsToObject(pairs) {
  const out = {};
  const items = [];
  for (const [key, value] of pairs) {
    const item = key.match(/^items\[(\d*)\]\[(\w+)\]$/);
    if (item) {
      const index = item[1] === '' ? (item[2] === 'id' ? items.length : items.length - 1) : Number(item[1]);
      items[index] = { ...(items[index] ?? {}), [item[2]]: value };
      continue;
    }
    const update = key.match(/^updates\[(.+)\]$/);
    if (update) {
      out.updates = { ...(out.updates ?? {}), [update[1]]: value };
      continue;
    }
    out[key] = value;
  }
  if (items.length) out.items = items.filter(Boolean);
  return out;
}

/**
 * @param {object} options
 * @param {string} options.root - directory written by render.mjs
 * @param {Preview | (() => Preview)} options.preview - an instance, or a factory (live mode)
 * @param {boolean} [options.live] - re-read the theme on every request and render the pages listed
 *   in render-report.json on demand instead of serving the files written by render.mjs
 * @param {number} [options.port] - 0 = any free port
 * @param {string} [options.host]
 */
export function startServer({ root, preview: source, live = false, port = 0, host = '127.0.0.1' }) {
  const factory = typeof source === 'function' ? source : () => source;
  let preview = factory();
  const manifest = new Map();
  const reportFile = path.join(root, 'render-report.json');
  if (existsSync(reportFile)) {
    const report = JSON.parse(readFileSync(reportFile, 'utf8'));
    for (const page of report.pages ?? []) manifest.set(page.url, { locale: page.locale, id: page.page });
  }
  let cart = CART_LINES.map((line) => ({ ...line }));
  const requests = [];

  const specFor = (pathname, searchParams) => {
    const known = manifest.get(pathname);
    if (known) {
      const spec = preview.pageSpec(known.id, known.locale);
      for (const [key, value] of searchParams) {
        if (key !== 'section_id' && key !== 'sections') spec.query[key] = value;
      }
      return spec;
    }
    return preview.resolveRequest(pathname, searchParams);
  };

  const localeOf = (pathname) => {
    const first = pathname.split('/').filter(Boolean)[0];
    return LOCALES.some((l) => !l.primary && l.iso_code === first) ? first : LOCALES.find((l) => l.primary).iso_code;
  };

  const cartWorld = (locale = 'he') => preview.world(preview.pageSpec('cart', locale), cart);

  function sectionsFor(ids, sectionsUrl, locale) {
    if (!ids?.length) return undefined;
    const target = new URL(sectionsUrl || (locale === 'he' ? '/' : `/${locale}`), 'http://preview.local');
    const spec = specFor(target.pathname, target.searchParams) ?? preview.pageSpec('index', locale);
    return preview.renderSections(spec, ids, { cartLines: cart });
  }

  function send(res, status, body, type = 'text/plain; charset=utf-8', headers = {}) {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...headers });
    res.end(body);
  }

  const sendJson = (res, status, data, headers = {}) =>
    send(res, status, JSON.stringify(data), TYPES['.json'], headers);

  /** Gaps of sections rendered for an API response travel in a header (serve-and-shoot reports them). */
  const gapHeaders = (rendered) => {
    const gaps = rendered?.gaps ?? [];
    if (!gaps.length) return {};
    const messages = gaps.slice(0, 20).map((g) => `[${g.kind}] ${g.message}`);
    return { 'x-sw-preview-gaps': encodeURIComponent(JSON.stringify(messages)) };
  };

  const sendSection = (res, out, id) =>
    out[id] === null
      ? send(res, 404, 'Not found', undefined, gapHeaders(out))
      : send(res, 200, out[id], TYPES['.html'], gapHeaders(out));

  function serveFile(res, file) {
    const type = TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    createReadStream(file).pipe(res);
  }

  function addToCart(world, variantId, quantity) {
    for (const product of world.products.values()) {
      const variant = product.variants.find((v) => v.id === Number(variantId));
      if (!variant) continue;
      if (!variant.available) return { error: `${product.title} - ${variant.title} is sold out.` };
      const existing = cart.find((line) => line.handle === product.handle && line.size === variant.title);
      if (existing) existing.quantity += quantity;
      else cart.push({ handle: product.handle, size: variant.title, quantity });
      return { product, variant };
    }
    return { error: 'Cannot find variant' };
  }

  async function handleCart(req, res, url, pathname) {
    const locale = localeOf(pathname);
    const action = pathname.match(/\/cart(?:\/(add|change|update|clear))?(\.js|\.json)?$/);
    const [, verb, ext] = action;
    const isJs = Boolean(ext);
    const body = req.method === 'POST' ? parseBody(await readBody(req), req.headers['content-type']) : null;
    const data = body ? (body.json ?? pairsToObject(body.pairs)) : {};
    const sectionIds = String(data.sections ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const respondWithSections = (payload) => {
      const sections = sectionsFor(sectionIds, data.sections_url, locale);
      return sendJson(res, 200, sections ? { ...payload, sections } : payload, gapHeaders(sections));
    };

    if (!verb) {
      if (!isJs) return false; // /cart page: rendered as a storefront page
      return sendJson(res, 200, preview.cartJson(cartWorld(locale)));
    }
    if (verb === 'add') {
      const world = cartWorld(locale);
      const items = data.items ?? [{ id: data.id, quantity: data.quantity ?? 1 }];
      const added = [];
      for (const item of items) {
        const result = addToCart(world, item.id, Math.max(1, Number(item.quantity) || 1));
        if (result.error) {
          return isJs
            ? sendJson(res, 422, { status: 422, message: 'Cart Error', description: result.error })
            : send(res, 302, '', 'text/plain', { location: `${locale === 'he' ? '' : `/${locale}`}/cart` });
        }
        added.push(result.variant.id);
      }
      if (!isJs) return send(res, 302, '', 'text/plain', { location: `${locale === 'he' ? '' : `/${locale}`}/cart` });
      const json = preview.cartJson(cartWorld(locale));
      const lines = json.items.filter((item) => added.includes(item.variant_id));
      return respondWithSections(data.items ? { items: lines } : lines[0]);
    }
    if (verb === 'clear') cart = [];
    if (verb === 'change') {
      const json = preview.cartJson(cartWorld(locale));
      let index = -1;
      if (data.line) index = Number(data.line) - 1;
      else if (data.id) {
        index = json.items.findIndex((item) => item.key === String(data.id) || item.variant_id === Number(data.id));
      }
      if (index < 0 || index >= cart.length) {
        return sendJson(res, 400, { status: 400, message: 'Cart Error', description: 'No valid line item' });
      }
      const quantity = Math.max(0, Number(data.quantity) || 0);
      if (quantity === 0) cart.splice(index, 1);
      else cart[index].quantity = quantity;
    }
    if (verb === 'update') {
      const json = preview.cartJson(cartWorld(locale));
      const updates = data.updates ?? {};
      const entries = Array.isArray(updates) ? updates.map((q, i) => [i, q]) : Object.entries(updates);
      for (const [key, value] of entries) {
        const index = Array.isArray(updates)
          ? Number(key)
          : json.items.findIndex((item) => item.key === key || item.variant_id === Number(key));
        if (index >= 0 && cart[index]) cart[index].quantity = Math.max(0, Number(value) || 0);
      }
      cart = cart.filter((line) => line.quantity > 0);
    }
    if (!isJs) return send(res, 302, '', 'text/plain', { location: `${locale === 'he' ? '' : `/${locale}`}/cart` });
    return respondWithSections(preview.cartJson(cartWorld(locale)));
  }

  function renderStorefront(res, spec, status = 200) {
    const { html } = preview.renderPage(spec, { cartLines: cart });
    send(res, status, html, TYPES['.html']);
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://preview.local');
    let pathname = url.pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      // keep the raw path when it is not valid percent-encoding
    }
    requests.push(`${req.method} ${url.pathname}${url.search}`);
    if (requests.length > 500) requests.shift();
    if (live && !/\.(css|js|png|jpe?g|svg|webp|gif|woff2?|ico)$/.test(pathname)) preview = factory();

    if (pathname === '/__preview/reset') {
      cart = CART_LINES.map((line) => ({ ...line }));
      return sendJson(res, 200, { ok: true });
    }
    if (/^(?:\/(?:en|ar))?\/cart(?:\/(?:add|change|update|clear))?(?:\.js|\.json)?$/.test(pathname)) {
      const handled = await handleCart(req, res, url, pathname);
      if (handled !== false) return undefined;
    }
    if (req.method === 'POST' && /^(?:\/(?:en|ar))?\/localization$/.test(pathname)) {
      const body = pairsToObject(parseBody(await readBody(req), req.headers['content-type']).pairs);
      const target = LOCALES.find((l) => l.iso_code === body.language_code) ?? LOCALES[0];
      const returnTo = String(body.return_to ?? '/').replace(/^\/(en|ar)(?=\/|$)/, '') || '/';
      const location = target.primary ? returnTo : `/${target.iso_code}${returnTo === '/' ? '' : returnTo}`;
      return send(res, 302, '', 'text/plain', { location });
    }
    const productJs = pathname.match(/^(?:\/(?:en|ar))?\/products\/([^/]+)\.js(?:on)?$/);
    if (productJs) {
      const json = preview.productJson(cartWorld(localeOf(pathname)), productJs[1]);
      return json ? sendJson(res, 200, json) : sendJson(res, 404, { status: 404, message: 'Not found' });
    }
    const suggest = pathname.match(/^(?:\/(?:en|ar))?\/search\/suggest(\.json)?$/);
    if (suggest) {
      const locale = localeOf(pathname);
      const terms = url.searchParams.get('q') ?? '';
      const spec = preview.pageSpec('search-empty', locale);
      const sectionId = url.searchParams.get('section_id');
      if (sectionId) {
        const out = preview.renderSections(spec, [sectionId], {
          cartLines: cart,
          extra: (world) => ({ predictive_search: world.buildPredictiveSearch(terms) }),
        });
        return sendSection(res, out, sectionId);
      }
      const ps = cartWorld(locale).buildPredictiveSearch(terms);
      return sendJson(res, 200, {
        resources: {
          results: {
            products: ps.resources.products.map((p) => ({
              title: p.title,
              url: p.url,
              handle: p.handle,
              price: String(p.price / 100),
            })),
            collections: ps.resources.collections.map((c) => ({ title: c.title, url: c.url, handle: c.handle })),
            pages: ps.resources.pages.map((p) => ({ title: p.title, url: p.url, handle: p.handle })),
            queries: ps.resources.queries.map((q) => ({ text: q.text, styled_text: q.styled_text, url: q.url })),
            articles: [],
          },
        },
      });
    }
    const recommendations = pathname.match(/^(?:\/(?:en|ar))?\/recommendations\/products(\.json)?$/);
    if (recommendations) {
      const locale = localeOf(pathname);
      const world = cartWorld(locale);
      const productId = Number(url.searchParams.get('product_id'));
      const product = [...world.products.values()].find((p) => p.id === productId) ?? null;
      const intent = url.searchParams.get('intent') ?? 'related';
      const limit = Number(url.searchParams.get('limit')) || 4;
      const sectionId = url.searchParams.get('section_id');
      if (sectionId) {
        const spec = product
          ? preview.pageSpec(`product:${product.handle}`, locale)
          : preview.pageSpec('index', locale);
        const out = preview.renderSections(spec, [sectionId], {
          cartLines: cart,
          extra: (w) => ({ recommendations: w.buildRecommendations(w.product(product?.handle), intent, limit) }),
        });
        return sendSection(res, out, sectionId);
      }
      const recs = world.buildRecommendations(product, intent, limit);
      return sendJson(res, 200, { products: recs.products.map((p) => preview.productJson(world, p.handle)) });
    }

    // Section Rendering API on any page URL.
    const sectionId = url.searchParams.get('section_id');
    const sectionList = url.searchParams.get('sections');
    if (sectionId || sectionList) {
      const spec = specFor(pathname, url.searchParams);
      if (!spec) return send(res, 404, 'Not found');
      if (sectionId) {
        const out = preview.renderSections(spec, [sectionId], { cartLines: cart });
        return sendSection(res, out, sectionId);
      }
      const ids = sectionList
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const out = preview.renderSections(spec, ids, { cartLines: cart });
      return sendJson(res, 200, out, gapHeaders(out));
    }

    if (live && manifest.has(pathname)) return renderStorefront(res, specFor(pathname, url.searchParams));

    // Theme assets straight from the theme (always fresh), then the rendered output.
    if (pathname.startsWith('/assets/')) {
      const file = path.join(preview.themeDir, 'assets', path.basename(pathname));
      if (existsSync(file)) return serveFile(res, file);
    }
    const generated = preview.generatedFiles.get(pathname);
    if (generated) return send(res, 200, generated.content, generated.type);
    let file = path.join(root, pathname);
    if (!file.startsWith(path.resolve(root))) return send(res, 403, 'Forbidden');
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (existsSync(file) && statSync(file).isFile() && pathname !== '/') return serveFile(res, file);

    const spec = preview.resolveRequest(pathname, url.searchParams);
    if (spec) return renderStorefront(res, spec);
    return renderStorefront(res, preview.pageSpec('404', localeOf(pathname)), 404);
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      console.error(`preview server: ${req.method} ${req.url} failed:`, error);
      if (!res.headersSent) send(res, 500, `Preview server error: ${error.message}`);
      else res.end();
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      resolve({
        url: `http://${host}:${address.port}`,
        port: address.port,
        requests,
        resetCart: () => {
          cart = CART_LINES.map((line) => ({ ...line }));
        },
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}
