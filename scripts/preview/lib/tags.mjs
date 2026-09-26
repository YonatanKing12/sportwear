// Shopify tags for LiquidJS: section, sections, content_for, form, paginate, style, plus Shopify
// flavoured render/include/layout. {% schema %}, {% doc %}, {% stylesheet %} and {% javascript %}
// are cut out of every file before parsing (see engine.mjs) and replaced by `sw_bundle` markers,
// so their raw content never goes through the Liquid tokenizer.
import { ForTag, Hash, IncludeTag, RenderTag, Tag, TypeGuards, evalToken, toValue } from 'liquidjs';
import { BaseDrop, clearWindow, setWindow } from './drops.mjs';
import { CONTAINER, stateOf } from './gaps.mjs';
import { attrs, escapeHtml } from './util.mjs';

/** Reads `key: value` arguments where keys may contain dots (closest.product: product). */
function readArguments(tokenizer) {
  const args = [];
  for (;;) {
    tokenizer.skipBlank();
    if (tokenizer.peek() === ',') {
      tokenizer.advance();
      tokenizer.skipBlank();
    }
    if (tokenizer.end()) break;
    let name = tokenizer.readIdentifier().content;
    if (!name) break;
    while (tokenizer.peek() === '.') {
      tokenizer.advance();
      name += `.${tokenizer.readIdentifier().content}`;
    }
    tokenizer.skipBlank();
    let value = null;
    if (tokenizer.peek() === ':') {
      tokenizer.advance();
      value = tokenizer.readValue();
    }
    args.push([name, value]);
  }
  return args;
}

function* evalArguments(args, ctx) {
  const out = {};
  for (const [name, token] of args) out[name] = token ? yield evalToken(token, ctx) : true;
  return out;
}

/** Parses the body of a block tag until its end tag. */
function parseBody(tag, token, remainTokens, parser, endName) {
  const templates = [];
  const stream = parser.parseStream(remainTokens);
  stream
    .on(`tag:${endName}`, () => stream.stop())
    .on('template', (tpl) => templates.push(tpl))
    .on('end', () => {
      throw new Error(`tag ${token.getText()} not closed`);
    });
  stream.start();
  return templates;
}

/** Fallback for raw-content tags that were not cut out by the preprocessor. */
function skipTag(endName) {
  return class extends Tag {
    constructor(token, remainTokens, liquid) {
      super(token, remainTokens, liquid);
      while (remainTokens.length) {
        const next = remainTokens.shift();
        if (TypeGuards.isTagToken(next) && next.name === endName) return;
      }
      throw new Error(`tag ${token.getText()} not closed`);
    }

    *render() {}
  };
}

/** Marker left where a {% stylesheet %} / {% javascript %} tag was: records the file's code once. */
class BundleTag extends Tag {
  constructor(token, remainTokens, liquid) {
    super(token, remainTokens, liquid);
    this.kind = this.tokenizer.readValue()?.content;
    this.file = token.file;
  }

  *render(ctx) {
    stateOf(ctx)?.collectBundle(this.kind, this.file);
  }
}

class SectionTag extends Tag {
  constructor(token, remainTokens, liquid) {
    super(token, remainTokens, liquid);
    this.name = this.tokenizer.readValue();
  }

  *render(ctx, emitter) {
    const name = yield evalToken(this.name, ctx);
    const state = stateOf(ctx);
    if (state) emitter.write(yield state.renderStaticSection(String(name)));
  }
}

class SectionsTag extends Tag {
  constructor(token, remainTokens, liquid) {
    super(token, remainTokens, liquid);
    this.name = this.tokenizer.readValue();
  }

  *render(ctx, emitter) {
    const name = yield evalToken(this.name, ctx);
    const state = stateOf(ctx);
    if (state) emitter.write(yield state.renderSectionGroup(String(name)));
  }
}

class ContentForTag extends Tag {
  constructor(token, remainTokens, liquid) {
    super(token, remainTokens, liquid);
    this.kind = this.tokenizer.readValue();
    this.args = readArguments(this.tokenizer);
  }

  *render(ctx, emitter) {
    const kind = yield evalToken(this.kind, ctx);
    const args = yield* evalArguments(this.args, ctx);
    const state = stateOf(ctx);
    if (!state) return;
    const container = ctx.globals[CONTAINER];
    if (kind === 'blocks') emitter.write(yield state.renderBlocks(container, args));
    else if (kind === 'block') emitter.write(yield state.renderStaticBlock(container, args));
    else state.gap('unsupported', `content_for '${kind}' is not a Shopify content_for type`);
  }
}

class StyleTag extends Tag {
  constructor(token, remainTokens, liquid, parser) {
    super(token, remainTokens, liquid);
    this.templates = parseBody(this, token, remainTokens, parser, 'endstyle');
  }

  *render(ctx, emitter) {
    const css = yield this.liquid.renderer.renderTemplates(this.templates, ctx);
    emitter.write(`<style data-shopify>${css}</style>`);
  }
}

/* ---------------------------------------------------------------------------------- forms */

const FORMS = {
  product: (o, r, s) => ({
    action: r.cart_add_url,
    id: `product_form_${o?.id ?? ''}`,
    class: 'shopify-product-form',
    enctype: 'multipart/form-data',
    after: [
      `<input type="hidden" name="product-id" value="${escapeHtml(o?.id ?? '')}" />`,
      s ? `<input type="hidden" name="section-id" value="${escapeHtml(s)}" />` : '',
    ].join(''),
  }),
  cart: (o, r) => ({ action: r.cart_url, id: 'cart_form', class: 'shopify-cart-form', enctype: 'multipart/form-data' }),
  contact: (o, r) => ({ action: `${r.root}/contact#contact_form`, id: 'contact_form', class: 'contact-form' }),
  customer: (o, r) => ({ action: `${r.root}/contact#contact_form`, id: 'contact_form', class: 'contact-form' }),
  create_customer: (o, r) => ({
    action: `${r.root}/account`,
    id: 'create_customer',
    extra: { 'data-login-with-shop-sign-up': 'true' },
  }),
  customer_login: (o, r) => ({
    action: `${r.root}/account/login`,
    id: 'customer_login',
    extra: { 'data-login-with-shop-sign-in': 'true', novalidate: 'novalidate' },
  }),
  guest_login: (o, r) => ({
    action: `${r.root}/account/login`,
    id: 'customer_login_guest',
    after: '<input type="hidden" name="guest" value="true" />',
  }),
  recover_customer_password: (o, r) => ({ action: `${r.root}/account/recover` }),
  reset_customer_password: (o, r) => ({ action: `${r.root}/account/reset` }),
  activate_customer_password: (o, r) => ({ action: `${r.root}/account/activate` }),
  customer_address: (o, r) => ({
    action: o?.id ? `${r.root}/account/addresses/${o.id}` : `${r.root}/account/addresses`,
    id: o?.id ? `address_form_${o.id}` : 'address_form_new',
  }),
  localization: (o, r, s, request) => ({
    action: `${r.root}/localization`,
    id: 'localization_form',
    class: 'shopify-localization-form',
    enctype: 'multipart/form-data',
    before: `<input type="hidden" name="_method" value="put" /><input type="hidden" name="return_to" value="${escapeHtml(request?.path ?? '/')}" />`,
  }),
  storefront_password: (o, r) => ({
    action: `${r.root}/password`,
    id: 'login_form',
    class: 'storefront-password-form',
  }),
  new_comment: (o, r) => ({
    action: `${o?.url ?? `${r.root}/blogs`}/comments#comment_form`,
    id: 'comment_form',
    class: 'comment-form',
  }),
  currency: (o, r) => ({ action: r.cart_update_url, id: 'currency_form', class: 'shopify-currency-form' }),
};

class FormTag extends Tag {
  constructor(token, remainTokens, liquid, parser) {
    super(token, remainTokens, liquid);
    const tz = this.tokenizer;
    this.type = tz.readValue();
    tz.skipBlank();
    if (tz.peek() === ',') tz.advance();
    tz.skipBlank();
    const save = tz.p;
    const ident = tz.readIdentifier();
    tz.skipBlank();
    const isKey = Boolean(ident.content) && tz.peek() === ':';
    tz.p = save;
    this.object = null;
    if (!isKey && !tz.end()) {
      this.object = tz.readValue();
      tz.skipBlank();
      if (tz.peek() === ',') tz.advance();
    }
    this.hash = new Hash(tz, liquid.options.keyValueSeparator);
    this.templates = parseBody(this, token, remainTokens, parser, 'endform');
  }

  *render(ctx, emitter) {
    const state = stateOf(ctx);
    const type = String(yield evalToken(this.type, ctx));
    const object = this.object ? yield evalToken(this.object, ctx) : null;
    const hash = yield this.hash.render(ctx);
    const world = state?.world;
    const routes = world
      ? { ...Object.fromEntries(Object.entries(world.routes)), root: world.root }
      : { root: '', cart_add_url: '/cart/add', cart_url: '/cart', cart_update_url: '/cart/update' };
    const sectionId = ctx.globals?.section?.id ?? null;
    const def = FORMS[type];
    if (!def) state?.gap('unsupported', `form type '${type}' is not emulated (rendered as a plain form)`);
    const config = def ? def(object, routes, sectionId, world ? ctx.globals.request : null) : { action: '#' };
    const attributes = {
      method: 'post',
      action: config.action,
      id: hash.id ?? config.id,
      'accept-charset': 'UTF-8',
      class: hash.class ?? config.class,
      enctype: config.enctype,
      ...(config.extra ?? {}),
    };
    let returnTo = '';
    for (const [key, value] of Object.entries(hash)) {
      if (key === 'id' || key === 'class') continue;
      if (key === 'return_to') {
        returnTo = `<input type="hidden" name="return_to" value="${escapeHtml(toValue(value))}" />`;
        continue;
      }
      attributes[key] = toValue(value);
    }
    const form = new BaseDrop('form', {
      id: attributes.id ?? null,
      errors: null,
      'posted_successfully?': false,
      author: null,
      body: null,
      email: null,
      first_name: null,
      last_name: null,
      password_needed: false,
      address1: null,
      address2: null,
      city: null,
      company: null,
      country: null,
      phone: null,
      province: null,
      zip: null,
      set_as_default_checkbox: '',
    });
    ctx.push({ form });
    let inner;
    try {
      inner = yield this.liquid.renderer.renderTemplates(this.templates, ctx);
    } finally {
      ctx.pop();
    }
    emitter.write(
      `<form${attrs(attributes)}><input type="hidden" name="form_type" value="${escapeHtml(type)}" /><input type="hidden" name="utf8" value="✓" />${config.before ?? ''}${returnTo}${inner}${config.after ?? ''}</form>`,
    );
  }
}

/* ------------------------------------------------------------------------------- paginate */

function paginationParts(current, pages, pageUrl, windowSize) {
  const parts = [];
  const part = (title, url, isLink) => new BaseDrop('part', { title, url, is_link: isLink });
  let gapAdded = false;
  for (let page = 1; page <= pages; page += 1) {
    const near = Math.abs(page - current) <= windowSize;
    if (page === 1 || page === pages || near) {
      parts.push(part(String(page), pageUrl(page), page !== current));
      gapAdded = false;
    } else if (!gapAdded) {
      parts.push(part('…', null, false));
      gapAdded = true;
    }
  }
  return parts;
}

class PaginateTag extends Tag {
  constructor(token, remainTokens, liquid, parser) {
    super(token, remainTokens, liquid);
    const tz = this.tokenizer;
    this.collection = tz.readValue();
    const text = this.collection?.getText() ?? '';
    const dot = text.lastIndexOf('.');
    this.ownerText = dot > 0 ? text.slice(0, dot) : null;
    this.key = dot > 0 ? text.slice(dot + 1) : '*';
    tz.skipBlank();
    const by = tz.readIdentifier().content;
    if (by !== 'by') throw new Error(`paginate: expected "by" in ${token.getText()}`);
    this.pageSize = tz.readValue();
    this.hash = new Hash(tz, liquid.options.keyValueSeparator);
    this.templates = parseBody(this, token, remainTokens, parser, 'endpaginate');
  }

  *render(ctx, emitter) {
    const state = stateOf(ctx);
    const size = Math.max(1, Number(yield evalToken(this.pageSize, ctx)) || 50);
    const hash = yield this.hash.render(ctx);
    const owner = this.ownerText ? yield this.liquid._evalValue(this.ownerText, ctx) : null;
    const target = this.ownerText ? owner : yield evalToken(this.collection, ctx);
    const all = toValue(this.ownerText ? (owner?.[this.key] ?? null) : target);
    const list = Array.isArray(all) ? all : [];
    const total =
      this.ownerText && owner?.[`${this.key}_count`] !== undefined ? owner[`${this.key}_count`] : list.length;
    const pages = Math.max(1, Math.ceil(total / size));
    const requested = Number(state?.world.spec.query?.page) || 1;
    const current = Math.min(Math.max(1, requested), pages);
    const offset = (current - 1) * size;
    const basePath = state?.world.requestPath ?? '/';
    const baseQuery = { ...(state?.world.spec.query ?? {}) };
    delete baseQuery.page;
    const pageUrl = (page) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(baseQuery)) {
        if (key === 'variant') continue;
        for (const v of Array.isArray(value) ? value : [value]) params.append(key, v);
      }
      params.set('page', String(page));
      return `${basePath}?${params}`;
    };
    const windowSize = Number(hash.window_size) || 1;
    const parts = paginationParts(current, pages, pageUrl, windowSize);
    const paginate = new BaseDrop('paginate', {
      current_offset: offset,
      current_page: current,
      items: total,
      page_size: size,
      pages,
      page_param: 'page',
      parts,
      previous: current > 1 ? new BaseDrop('part', { title: '«', url: pageUrl(current - 1), is_link: true }) : null,
      next: current < pages ? new BaseDrop('part', { title: '»', url: pageUrl(current + 1), is_link: true }) : null,
    });
    const windowOwner = this.ownerText ? owner : target;
    if (!(windowOwner instanceof BaseDrop)) {
      state?.gap('unsupported', `paginate over "${this.collection.getText()}" is not a paginatable mock list`);
    }
    setWindow(windowOwner, this.key, { offset, size });
    ctx.push({ paginate, current_page: current });
    try {
      emitter.write(yield this.liquid.renderer.renderTemplates(this.templates, ctx));
    } finally {
      ctx.pop();
      clearWindow(windowOwner, this.key);
    }
  }
}

/* ------------------------------------------------------------------ render, include, layout */

/** LiquidJS has no forloop.parentloop; Shopify does. */
class ShopifyForTag extends ForTag {
  *render(ctx, emitter) {
    let parent = null;
    try {
      parent = ctx.getSync(['forloop']) ?? null;
    } catch {
      parent = null;
    }
    const push = ctx.push;
    ctx.push = function pushWithParentLoop(scope) {
      if (scope?.forloop && typeof scope.forloop === 'object') {
        scope.forloop.parentloop = parent;
        ctx.push = push;
      }
      return push.call(this, scope);
    };
    try {
      yield super.render(ctx, emitter);
    } finally {
      ctx.push = push;
    }
  }
}

class ShopifyRenderTag extends RenderTag {
  *render(ctx, emitter) {
    if (this.forBinding && !this.forBinding.alias && typeof this.file === 'string') {
      this.forBinding.alias = this.file;
    }
    const state = stateOf(ctx);
    const name = typeof this.file === 'string' ? this.file : '(dynamic)';
    state?.fileStack.push(`snippets/${name}.liquid`);
    try {
      yield super.render(ctx, emitter);
    } finally {
      state?.fileStack.pop();
    }
  }
}

class ShopifyIncludeTag extends IncludeTag {
  *render(ctx, emitter) {
    const state = stateOf(ctx);
    const name = typeof this.file === 'string' ? this.file : '(dynamic)';
    state?.fileStack.push(`snippets/${name}.liquid`);
    try {
      yield super.render(ctx, emitter);
    } finally {
      state?.fileStack.pop();
    }
  }
}

class LayoutTag extends Tag {
  constructor(token, remainTokens, liquid) {
    super(token, remainTokens, liquid);
    const text = this.tokenizer.remaining().trim();
    this.value = text === 'none' ? null : text.replace(/^['"]|['"]$/g, '');
  }

  *render(ctx) {
    stateOf(ctx)?.setLayout(this.value);
  }
}

export function installTags(liquid) {
  liquid.registerTag('sw_bundle', BundleTag);
  liquid.registerTag('schema', skipTag('endschema'));
  liquid.registerTag('doc', skipTag('enddoc'));
  liquid.registerTag('stylesheet', skipTag('endstylesheet'));
  liquid.registerTag('javascript', skipTag('endjavascript'));
  liquid.registerTag('section', SectionTag);
  liquid.registerTag('sections', SectionsTag);
  liquid.registerTag('content_for', ContentForTag);
  liquid.registerTag('style', StyleTag);
  liquid.registerTag('form', FormTag);
  liquid.registerTag('paginate', PaginateTag);
  liquid.registerTag('for', ShopifyForTag);
  liquid.registerTag('render', ShopifyRenderTag);
  liquid.registerTag('include', ShopifyIncludeTag);
  liquid.registerTag('layout', LayoutTag);
}
