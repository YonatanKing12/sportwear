// Shopify filters on top of LiquidJS's standard ones. Filters that cannot be emulated report a gap
// and return their input, and unknown filters (typos included) are reported instead of ignored.
import { createHash, createHmac } from 'node:crypto';
import { Drop, filters as builtinFilters, toValue } from 'liquidjs';
import { BaseDrop } from './drops.mjs';
import { stateOf } from './gaps.mjs';
import {
  attrs,
  brightness,
  escapeHtml,
  formatAlpha,
  formatMoney,
  handleize,
  hslToRgb,
  luminance,
  parseColor,
  rgbToHsl,
  toHex,
} from './util.mjs';

/** Splits filter arguments into positional values and named (key: value) ones. */
function argsOf(filter, args) {
  const spec = filter?.token?.args ?? [];
  const positional = [];
  const named = {};
  args.forEach((arg, index) => {
    if (Array.isArray(spec[index])) named[spec[index][0]] = arg?.[1];
    else positional.push(arg);
  });
  return { positional, named };
}

const num = (value) => {
  const v = toValue(value);
  if (v === null || v === undefined || v === '') return NaN;
  return Number(v);
};

function gap(filter, kind, message) {
  stateOf(filter.context)?.gap(kind, message);
}

/* ---------------------------------------------------------------------------------- images */

const DEFAULT_SRCSET_WIDTHS = [352, 832, 1200, 1920, 2560, 3840];

/** Finds the image behind anything image_url accepts (image, media, product, variant, ...). */
function imageOf(input) {
  if (!(input instanceof BaseDrop)) return null;
  if (input.__file) return input;
  if (input.__image) return input.__image;
  for (const key of ['featured_image', 'featured_media', 'image', 'preview_image']) {
    const inner = input[key];
    if (inner instanceof BaseDrop && inner !== input) {
      const found = imageOf(inner);
      if (found) return found;
    }
  }
  return null;
}

function imageUrl(input, ...args) {
  const { positional, named } = argsOf(this, args);
  if (positional.length) gap(this, 'unsupported', 'image_url with positional arguments is not valid Shopify syntax');
  return makeImageUrl(this, input, named);
}

function makeImageUrl(filter, input, named) {
  const state = stateOf(filter.context);
  const image = imageOf(input);
  if (!image) {
    if (input === null || input === undefined || input === '') {
      gap(filter, 'liquid-error', 'image_url received nil (Shopify renders an error here); output is empty');
    } else {
      gap(filter, 'unsupported', `image_url on "${String(toValue(input)).slice(0, 60)}" is not emulated`);
    }
    return '';
  }
  const params = { v: '1' };
  for (const key of ['width', 'height', 'crop', 'format', 'pad_color']) {
    const value = toValue(named[key]);
    if (value !== undefined && value !== null && value !== '') params[key] = value;
  }
  const query = Object.keys(params)
    .sort()
    .map((key) => `${key}=${encodeURIComponent(params[key])}`)
    .join('&');
  const url = `${image.__url}?${query}`;
  state?.imageUrls.set(url, {
    image,
    width: params.width ? Number(params.width) : null,
    height: params.height ? Number(params.height) : null,
    crop: params.crop ?? null,
  });
  return url;
}

function withWidth(url, width) {
  const [base, query = ''] = url.split('?');
  const params = new URLSearchParams(query);
  params.set('width', String(width));
  return `${base}?${[...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')}`;
}

function imageTag(input, ...args) {
  const { named } = argsOf(this, args);
  return makeImageTag(this, input, named);
}

function makeImageTag(filter, input, named) {
  const state = stateOf(filter.context);
  const url = String(toValue(input) ?? '');
  let info = state?.imageUrls.get(url);
  if (!info && input instanceof BaseDrop) {
    const image = imageOf(input);
    if (image) info = { image, width: null, height: null, crop: null };
  }
  if (!info) {
    gap(filter, 'unsupported', 'image_tag input is not an image_url result; srcset and dimensions are omitted');
    return `<img${attrs({ src: url, alt: toValue(named.alt) ?? '', class: toValue(named.class) })}>`;
  }
  const image = info.image;
  const ow = image.width;
  const oh = image.height;
  const aspect = ow / oh;
  let w = ow;
  let h = oh;
  if (info.width && info.height) {
    if (info.crop) {
      w = info.width;
      h = info.height;
    } else {
      const scale = Math.min(info.width / ow, info.height / oh, 1);
      w = Math.round(ow * scale);
      h = Math.round(oh * scale);
    }
  } else if (info.width) {
    w = Math.min(info.width, ow);
    h = Math.round(w / aspect);
  } else if (info.height) {
    h = Math.min(info.height, oh);
    w = Math.round(h * aspect);
  }

  const explicitWidth = 'width' in named ? toValue(named.width) : undefined;
  const explicitHeight = 'height' in named ? toValue(named.height) : undefined;
  let widths;
  if (named.widths !== undefined && named.widths !== null) {
    widths = String(toValue(named.widths))
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0 && n <= ow);
  } else {
    const max = Math.min(info.width ?? ow, ow);
    widths = DEFAULT_SRCSET_WIDTHS.filter((n) => n <= max);
    if (Number.isFinite(Number(explicitWidth)) && Number(explicitWidth) <= ow) widths.push(Number(explicitWidth));
  }
  widths = [...new Set(widths)].sort((a, b) => a - b);
  const srcset = widths.map((width) => `${withWidth(url, width)} ${width}w`).join(', ');

  const attributes = { src: url, alt: 'alt' in named ? (toValue(named.alt) ?? '') : image.alt };
  if (srcset) attributes.srcset = srcset;
  if (explicitWidth !== undefined || explicitHeight !== undefined) {
    if (explicitWidth !== null && explicitWidth !== undefined) attributes.width = explicitWidth;
    if (explicitHeight !== null && explicitHeight !== undefined) attributes.height = explicitHeight;
  } else {
    attributes.width = w;
    attributes.height = h;
  }
  for (const [key, value] of Object.entries(named)) {
    if (['widths', 'width', 'height', 'alt', 'preload'].includes(key)) continue;
    attributes[key] = toValue(value);
  }
  if (toValue(named.preload) === true) {
    state?.preloads.push({ as: 'image', href: url, imagesrcset: srcset, imagesizes: toValue(named.sizes) });
  }
  return `<img${attrs(attributes)}>`;
}

function imgUrl(input, ...args) {
  const { positional, named } = argsOf(this, args);
  const match = String(toValue(positional[0]) ?? '').match(/^(\d*)x(\d*)$/);
  const params = {};
  if (match?.[1]) params.width = Number(match[1]);
  if (match?.[2]) params.height = Number(match[2]);
  if (named.crop) params.crop = toValue(named.crop);
  return makeImageUrl(this, input, params);
}

/* Generic placeholder art: a garment on a frame (original drawing, not Shopify's artwork). */
function placeholderSvgTag(name, cssClass) {
  const cls = toValue(cssClass);
  return `<svg${attrs({ class: cls || 'placeholder-svg', xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 525.5 525.5', 'data-placeholder': toValue(name) })}><path d="M0 0h525.5v525.5H0z" opacity=".08"/><path d="M200 140l-60 30 22 52 28-12v175h146V210l28 12 22-52-60-30c-8 22-35 36-63 36s-55-14-63-36z" opacity=".55"/></svg>`;
}

/* ----------------------------------------------------------------------------------- money */

function money(value) {
  const cents = num(value);
  if (Number.isNaN(cents)) return '';
  return formatMoney(cents, stateOf(this.context)?.world.moneyFormat ?? '{{amount}}');
}

function moneyWithCurrency(value) {
  const cents = num(value);
  if (Number.isNaN(cents)) return '';
  return formatMoney(cents, stateOf(this.context)?.world.moneyWithCurrencyFormat ?? '{{amount}}');
}

function moneyWithoutCurrency(value) {
  const cents = num(value);
  if (Number.isNaN(cents)) return '';
  return formatMoney(cents, '{{amount}}');
}

function moneyWithoutTrailingZeros(value) {
  const cents = num(value);
  if (Number.isNaN(cents)) return '';
  return formatMoney(cents, stateOf(this.context)?.world.moneyFormat ?? '{{amount}}', { dropZeroDecimals: true });
}

/* ------------------------------------------------------------------------------------ json */

function toPlain(value, depth = 0) {
  if (value instanceof Drop && typeof value.toJSON === 'function') return value.toJSON();
  value = toValue(value);
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return value;
  if (depth > 5) return null;
  if (Array.isArray(value)) return value.map((item) => toPlain(item, depth + 1));
  if (value instanceof Map) return Object.fromEntries([...value].map(([k, v]) => [k, toPlain(v, depth + 1)]));
  const out = {};
  for (const key of Object.keys(value)) {
    const item = value[key];
    if (typeof item === 'function') continue;
    out[key] = toPlain(item, depth + 1);
  }
  return out;
}

const LINE_SEPARATOR = new RegExp(String.fromCharCode(0x2028), 'g');
const PARAGRAPH_SEPARATOR = new RegExp(String.fromCharCode(0x2029), 'g');

function json(value) {
  const text = JSON.stringify(toPlain(value)) ?? 'null';
  return text
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\//g, '\\/')
    .replace(LINE_SEPARATOR, '\\u2028')
    .replace(PARAGRAPH_SEPARATOR, '\\u2029');
}

/* ------------------------------------------------------------------------------------ i18n */

function translate(key, ...args) {
  const state = stateOf(this.context);
  const { named } = argsOf(this, args);
  const vars = Object.fromEntries(Object.entries(named).map(([k, v]) => [k, toValue(v)]));
  const text = String(toValue(key) ?? '');
  if (!state) return text;
  const result = state.translator.translate(state.locale, text, vars, { extra: state.sectionLocales });
  const fallback = state.translator.defaultLocale;
  if (result.status === 'missing') {
    const where =
      state.locale === fallback
        ? `locales/${fallback}.default.json`
        : `locales/${state.locale}.json and in locales/${fallback}.default.json`;
    state.gap('translation', `"${text}" is missing in ${where}`);
  } else if (result.status === 'fallback') {
    state.gap(
      'translation-fallback',
      `"${text}" is missing in locales/${state.locale}.json (the ${fallback} text is shown)`,
    );
  }
  if (result.detail) state.gap('translation', `"${text}" (${state.locale}): ${result.detail}`);
  return result.text;
}

const NAMED_DATE_FORMATS = {
  abbreviated_date: '%b %d, %Y',
  basic: '%m/%d/%Y',
  date: '%B %d, %Y',
  date_at_time: '%B %d, %Y at %l:%M %P',
  default: '%a, %b %d, %Y, %l:%M %P',
  on_date: 'on %B %d, %Y',
  short: '%d %b %H:%M',
  long: '%B %d, %Y %H:%M',
  month_day_year: '%B %d, %Y',
};

function dateFormat(filter, named, positional) {
  let format = positional[0];
  if (named.format !== undefined) {
    const name = String(toValue(named.format));
    const state = stateOf(filter.context);
    const fromLocale = state?.translator.translate(state.locale, `date_formats.${name}`, {});
    if (fromLocale && fromLocale.status !== 'missing') format = fromLocale.text;
    else {
      format = NAMED_DATE_FORMATS[name] ?? '%B %d, %Y';
      gap(filter, 'unsupported', `date format "${name}" is not in the theme locale files; used an English pattern`);
    }
  }
  return format;
}

function date(value, ...args) {
  const { positional, named } = argsOf(this, args);
  const format = dateFormat(this, named, positional);
  return builtinFilters.date.call(this, value, format);
}

function timeTag(value, ...args) {
  const { positional, named } = argsOf(this, args);
  const format = dateFormat(this, named, positional) ?? '%a, %b %d, %Y';
  const parsed = new Date(toValue(value));
  const datetime = Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const text = builtinFilters.date.call(this, value, format);
  return `<time datetime="${datetime}">${text}</time>`;
}

/* ------------------------------------------------------------------------------------ urls */

function root(filter) {
  return stateOf(filter.context)?.world.root ?? '';
}

function assetUrl(name) {
  const state = stateOf(this.context);
  return state ? state.preview.assetUrl(String(toValue(name)), (kind, message) => state.gap(kind, message)) : '';
}

function fileUrl(name) {
  return `/files/${encodeURIComponent(String(toValue(name)))}`;
}

function stylesheetTag(url, ...args) {
  const { named } = argsOf(this, args);
  if (toValue(named.preload) === true) stateOf(this.context)?.preloads.push({ as: 'style', href: String(url) });
  return `<link href="${escapeHtml(url)}" rel="stylesheet" type="text/css" media="${escapeHtml(toValue(named.media) ?? 'all')}" />`;
}

function scriptTag(url) {
  return `<script src="${escapeHtml(url)}" type="text/javascript"></script>`;
}

function preloadTag(url, ...args) {
  const { named } = argsOf(this, args);
  const attributes = { href: toValue(url) };
  for (const [key, value] of Object.entries(named)) attributes[key] = toValue(value);
  attributes.rel = 'preload';
  return `<link${attrs(attributes)}>`;
}

function urlForType(type) {
  return `${root(this)}/collections/types?q=${encodeURIComponent(String(toValue(type)))}`;
}

function urlForVendor(vendor) {
  return `${root(this)}/collections/vendors?q=${encodeURIComponent(String(toValue(vendor)))}`;
}

function within(url, collection) {
  const handle = collection?.handle;
  if (!handle) return url;
  const r = root(this);
  const path = String(toValue(url));
  const stripped = r && path.startsWith(r) ? path.slice(r.length) : path;
  return `${r}/collections/${handle}${stripped}`;
}

function linkTo(text, url, title) {
  return `<a href="${escapeHtml(url)}"${title ? ` title="${escapeHtml(title)}"` : ''}>${toValue(text) ?? ''}</a>`;
}

function sortBy(url, value) {
  const [base, query = ''] = String(toValue(url)).split('?');
  const params = new URLSearchParams(query);
  params.set('sort_by', String(toValue(value)));
  return `${base}?${params}`;
}

function currentTagsUrl(filter, tags) {
  const state = stateOf(filter.context);
  const collection = state?.world.spec.collection ?? 'all';
  return `${root(filter)}/collections/${collection}/${tags.map((t) => handleize(t)).join('+')}`;
}

function defaultPagination(paginate, ...args) {
  const { named } = argsOf(this, args);
  if (!paginate || !(paginate.pages > 1)) return '';
  const anchor = toValue(named.anchor) ?? '';
  const out = [];
  if (paginate.previous) {
    out.push(
      `<span class="prev"><a href="${escapeHtml(paginate.previous.url)}${anchor}">${toValue(named.previous) ?? '&laquo; Previous'}</a></span>`,
    );
  }
  for (const part of paginate.parts) {
    if (part.is_link)
      out.push(`<span class="page"><a href="${escapeHtml(part.url)}${anchor}">${part.title}</a></span>`);
    else if (String(part.title) === String(paginate.current_page))
      out.push(`<span class="page current">${part.title}</span>`);
    else out.push(`<span class="deco">${part.title}</span>`);
  }
  if (paginate.next) {
    out.push(
      `<span class="next"><a href="${escapeHtml(paginate.next.url)}${anchor}">${toValue(named.next) ?? 'Next &raquo;'}</a></span>`,
    );
  }
  return out.join(' ');
}

function highlight(text, terms) {
  const source = String(toValue(text) ?? '');
  const words = String(toValue(terms) ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return source;
  return source.replace(new RegExp(`(${words.join('|')})`, 'giu'), '<strong class="highlight">$1</strong>');
}

/* ---------------------------------------------------------------------------------- colors */

function colorArg(value) {
  return parseColor(toValue(value));
}

function colorOut(original, rgb, alpha = 1) {
  if (alpha < 1 || /^rgba/i.test(String(toValue(original)))) {
    return `rgba(${rgb.red}, ${rgb.green}, ${rgb.blue}, ${formatAlpha(alpha)})`;
  }
  return toHex(rgb);
}

function colorAdjust(value, fn) {
  const color = colorArg(value);
  if (!color) return value;
  const hsl = rgbToHsl(color);
  const next = fn(hsl);
  return colorOut(value, hslToRgb(next), color.alpha);
}

const colorFilters = {
  color_to_rgb(value) {
    const c = colorArg(value);
    if (!c) return value;
    return c.alpha < 1
      ? `rgba(${c.red}, ${c.green}, ${c.blue}, ${formatAlpha(c.alpha)})`
      : `rgb(${c.red}, ${c.green}, ${c.blue})`;
  },
  color_to_hsl(value) {
    const c = colorArg(value);
    if (!c) return value;
    const { hue, saturation, lightness } = rgbToHsl(c);
    return c.alpha < 1
      ? `hsla(${hue}, ${saturation}%, ${lightness}%, ${formatAlpha(c.alpha)})`
      : `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  },
  color_to_hex(value) {
    const c = colorArg(value);
    return c ? toHex(c) : value;
  },
  color_modify(value, field, amount) {
    const c = colorArg(value);
    if (!c) return value;
    const key = String(toValue(field));
    const n = num(amount);
    if (['red', 'green', 'blue'].includes(key)) {
      return colorOut(value, { ...c, [key]: Math.max(0, Math.min(255, n)) }, c.alpha);
    }
    if (key === 'alpha') return colorOut(value, c, Math.max(0, Math.min(1, n)));
    const hsl = rgbToHsl(c);
    return colorOut(value, hslToRgb({ ...hsl, [key]: n }), c.alpha);
  },
  color_lighten(value, amount) {
    return colorAdjust(value, (h) => ({ ...h, lightness: Math.min(100, h.lightness + num(amount)) }));
  },
  color_darken(value, amount) {
    return colorAdjust(value, (h) => ({ ...h, lightness: Math.max(0, h.lightness - num(amount)) }));
  },
  color_saturate(value, amount) {
    return colorAdjust(value, (h) => ({ ...h, saturation: Math.min(100, h.saturation + num(amount)) }));
  },
  color_desaturate(value, amount) {
    return colorAdjust(value, (h) => ({ ...h, saturation: Math.max(0, h.saturation - num(amount)) }));
  },
  color_brightness(value) {
    const c = colorArg(value);
    return c ? brightness(c) : 0;
  },
  color_contrast(value, other) {
    const a = colorArg(value);
    const b = colorArg(other);
    if (!a || !b) return 0;
    const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 10) / 10;
  },
  color_difference(value, other) {
    const a = colorArg(value);
    const b = colorArg(other);
    if (!a || !b) return 0;
    return (
      Math.max(a.red, b.red) -
      Math.min(a.red, b.red) +
      Math.max(a.green, b.green) -
      Math.min(a.green, b.green) +
      Math.max(a.blue, b.blue) -
      Math.min(a.blue, b.blue)
    );
  },
  brightness_difference(value, other) {
    const a = colorArg(value);
    const b = colorArg(other);
    if (!a || !b) return 0;
    return Math.round(Math.abs(brightness(a) - brightness(b)));
  },
  color_mix(value, other, weight) {
    const a = colorArg(value);
    const b = colorArg(other);
    if (!a || !b) return value;
    const w = Math.max(0, Math.min(100, num(weight))) / 100;
    const mix = (x, y) => Math.round(x * w + y * (1 - w));
    const alpha = Math.round((a.alpha * w + b.alpha * (1 - w)) * 100) / 100;
    return colorOut(value, { red: mix(a.red, b.red), green: mix(a.green, b.green), blue: mix(a.blue, b.blue) }, alpha);
  },
};

/* ------------------------------------------------------------------------------------ misc */

const PAYMENT_NAMES = {
  visa: 'Visa',
  master: 'Mastercard',
  american_express: 'American Express',
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
  paypal: 'PayPal',
  shopify_pay: 'Shop Pay',
  bit: 'Bit',
};

function paymentTypeSvgTag(type, ...args) {
  const { named } = argsOf(this, args);
  const id = String(toValue(type));
  const label = PAYMENT_NAMES[id] ?? id;
  const short = label
    .replace(/American Express/, 'AMEX')
    .replace(/Mastercard/, 'MC')
    .toUpperCase();
  return `<svg${attrs({ class: toValue(named.class) ?? undefined, xmlns: 'http://www.w3.org/2000/svg', role: 'img', 'aria-labelledby': `pi-${id}`, viewBox: '0 0 38 24', width: 38, height: 24 })}><title id="pi-${escapeHtml(id)}">${escapeHtml(label)}</title><rect width="38" height="24" rx="3" fill="#fff" stroke="#8a8f99"/><text x="19" y="15.5" font-size="${short.length > 6 ? 5.5 : 7}" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle" fill="#0d0e11">${escapeHtml(short)}</text></svg>`;
}

function formatAddress(address) {
  if (!address) return '';
  const lines = [
    address.company,
    [address.first_name, address.last_name].filter(Boolean).join(' '),
    address.address1,
    address.address2,
    [address.city, address.province_code, address.zip].filter(Boolean).join(' '),
    address.country,
  ].filter((line) => line && String(line).trim());
  return `<p>${lines.map((line) => escapeHtml(line)).join('<br>')}</p>`;
}

function structuredData(value) {
  const state = stateOf(this.context);
  if (value?.toJSON && value.variants) {
    const url = `${state?.world ? 'https://sfgzdp-1m.myshopify.com' : ''}${value.url}`;
    const data = {
      '@context': 'http://schema.org/',
      '@type': 'Product',
      name: value.title,
      url,
      image: value.featured_image ? [`https://sfgzdp-1m.myshopify.com${value.featured_image.__url}`] : [],
      description: String(value.description ?? '').replace(/<[^>]*>/g, ''),
      brand: { '@type': 'Brand', name: value.vendor },
      offers: value.variants.map((variant) => ({
        '@type': 'Offer',
        sku: variant.sku,
        availability: variant.available ? 'http://schema.org/InStock' : 'http://schema.org/OutOfStock',
        price: (variant.price / 100).toFixed(2),
        priceCurrency: 'ILS',
        url: `https://sfgzdp-1m.myshopify.com${variant.url}`,
      })),
    };
    return `<script type="application/ld+json">${json(data)}</script>`;
  }
  if (value?.excerpt_or_content !== undefined) {
    const data = {
      '@context': 'http://schema.org/',
      '@type': 'Article',
      headline: value.title,
      author: { '@type': 'Person', name: value.author },
      datePublished: value.published_at,
    };
    return `<script type="application/ld+json">${json(data)}</script>`;
  }
  gap(this, 'unsupported', 'structured_data only supports products and articles');
  return '';
}

function inlineAssetContent(name) {
  const state = stateOf(this.context);
  const content = state?.preview.assetContent(String(toValue(name)));
  if (content === null || content === undefined) {
    gap(this, 'missing-file', `inline_asset_content: assets/${toValue(name)} does not exist`);
    return '';
  }
  return content;
}

function metafieldText(metafield) {
  const value = metafield?.value ?? toValue(metafield);
  if (Array.isArray(value)) return value.map((v) => String(toValue(v))).join(', ');
  return String(toValue(value) ?? '');
}

function metafieldTag(metafield) {
  if (!metafield || !metafield.type) return '';
  const type = metafield.type;
  const value = metafield.value;
  if (type.startsWith('list.')) {
    const base = type.slice(5);
    const items = (value ?? []).map((v) => `<li class="metafield-${base}_array__item">${escapeHtml(toValue(v))}</li>`);
    return `<ul class="metafield-${base}_array">${items.join('')}</ul>`;
  }
  if (type === 'json') return `<script type="application/json" class="metafield-json">${json(value)}</script>`;
  if (type.endsWith('_reference')) {
    gap(this, 'unsupported', `metafield_tag for ${type} is not emulated`);
    return '';
  }
  return `<span class="metafield-${escapeHtml(type)}">${escapeHtml(toValue(value))}</span>`;
}

function mediaTag(media, ...args) {
  if (media?.media_type === 'image') {
    const { named } = argsOf(this, args);
    const url = makeImageUrl(this, media, { width: 1920 });
    return makeImageTag(this, url, named);
  }
  gap(this, 'unsupported', `media_tag for media_type "${media?.media_type}" is not emulated`);
  return '';
}

function hash(algorithm) {
  return (value) =>
    createHash(algorithm)
      .update(String(toValue(value) ?? ''))
      .digest('hex');
}

function hmac(algorithm) {
  return (value, secret) =>
    createHmac(algorithm, String(toValue(secret) ?? ''))
      .update(String(toValue(value) ?? ''))
      .digest('hex');
}

function unsupported(name, fallback = (value) => value) {
  return function (value, ...args) {
    gap(this, 'unsupported', `the ${name} filter is not emulated`);
    return fallback.call(this, value, ...args);
  };
}

/* ---------------------------------------------------------------------- liquid overrides */

/** Shopify (Ruby) semantics: integer / integer is integer division; a float literal keeps decimals. */
function dividedBy(value, divisor) {
  const a = num(value);
  const b = num(divisor);
  if (b === 0) throw new Error('divided by 0');
  const token = this.token?.args?.[0];
  const text = typeof token?.getText === 'function' ? token.getText() : '';
  const floatLiteral = /^-?\d+\.\d+$/.test(text);
  if (Number.isInteger(a) && Number.isInteger(b) && !floatLiteral) return Math.floor(a / b);
  return a / b;
}

/** Like Shopify: returns the object itself (LiquidJS would return a drop's primitive value). */
function defaultFilter(value, ...args) {
  const { positional, named } = argsOf(this, args);
  const fallback = positional[0];
  const v = toValue(value);
  if (Array.isArray(v) || typeof v === 'string') return v.length ? value : fallback;
  if (v === false && toValue(named.allow_false) === true) return false;
  if (v === false || v === null || v === undefined) return fallback;
  return value;
}

function size(value) {
  if (value instanceof BaseDrop && typeof value.size === 'number') return value.size;
  const v = toValue(value);
  if (v === null || v === undefined) return 0;
  if (typeof v === 'string' || Array.isArray(v)) return v.length;
  if (typeof v === 'object') return Object.keys(v).length;
  return 0;
}

function first(value) {
  const v = toValue(value);
  if (Array.isArray(v) || typeof v === 'string') return v[0];
  return undefined;
}

function last(value) {
  const v = toValue(value);
  if (Array.isArray(v) || typeof v === 'string') return v[v.length - 1];
  return undefined;
}

/* -------------------------------------------------------------------------------- registry */

export const SHOPIFY_FILTERS = {
  t: translate,
  translate,
  asset_url: assetUrl,
  asset_img_url: assetUrl,
  file_url: fileUrl,
  file_img_url: fileUrl,
  shopify_asset_url: unsupported('shopify_asset_url', (v) => `/shopify-assets/${toValue(v)}`),
  global_asset_url: unsupported('global_asset_url', (v) => `/global-assets/${toValue(v)}`),
  stylesheet_tag: stylesheetTag,
  script_tag: scriptTag,
  preload_tag: preloadTag,
  image_url: imageUrl,
  image_tag: imageTag,
  img_url: imgUrl,
  product_img_url: imgUrl,
  collection_img_url: imgUrl,
  article_img_url: imgUrl,
  img_tag(url, alt, cls) {
    return `<img${attrs({ src: toValue(url), alt: toValue(alt) ?? '', class: toValue(cls) })} />`;
  },
  placeholder_svg_tag: placeholderSvgTag,
  money,
  money_with_currency: moneyWithCurrency,
  money_without_currency: moneyWithoutCurrency,
  money_without_trailing_zeros: moneyWithoutTrailingZeros,
  json,
  handleize: (v) => handleize(toValue(v)),
  handle: (v) => handleize(toValue(v)),
  camelize: (v) =>
    String(toValue(v) ?? '')
      .split(/[-_\s]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(''),
  camelcase: (v) =>
    String(toValue(v) ?? '')
      .split(/[-_\s]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(''),
  pluralize: (count, singular, plural) => (Number(toValue(count)) === 1 ? singular : plural),
  url_for_type: urlForType,
  url_for_vendor: urlForVendor,
  within,
  link_to: linkTo,
  link_to_type(type) {
    return linkTo(type, urlForType.call(this, type));
  },
  link_to_vendor(vendor) {
    return linkTo(vendor, urlForVendor.call(this, vendor));
  },
  link_to_tag(label, tag) {
    return linkTo(label, currentTagsUrl(this, [String(toValue(tag))]), `Show products matching tag ${toValue(tag)}`);
  },
  link_to_add_tag(label, tag) {
    return linkTo(label, currentTagsUrl(this, [String(toValue(tag))]), `Show products matching tag ${toValue(tag)}`);
  },
  link_to_remove_tag(label, tag) {
    return linkTo(
      label,
      `${root(this)}/collections/${stateOf(this.context)?.world.spec.collection ?? 'all'}`,
      `Remove tag ${toValue(tag)}`,
    );
  },
  highlight_active_tag: (tag) => `<span class="active">${toValue(tag)}</span>`,
  sort_by: sortBy,
  default_pagination: defaultPagination,
  highlight,
  ...colorFilters,
  inline_asset_content: inlineAssetContent,
  format_address: formatAddress,
  payment_type_svg_tag: paymentTypeSvgTag,
  payment_type_img_url: (type) => `/payment-icons/${toValue(type)}.svg`,
  date,
  time_tag: timeTag,
  structured_data: structuredData,
  url_escape: (v) => encodeURI(String(toValue(v) ?? '')).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`),
  url_param_escape: (v) => encodeURIComponent(String(toValue(v) ?? '')),
  weight_with_unit: (grams, unit) => {
    const u = toValue(unit) ?? 'kg';
    const factor = { kg: 1000, g: 1, lb: 453.592, oz: 28.3495 }[u] ?? 1000;
    return `${Math.round((num(grams) / factor) * 100) / 100} ${u}`;
  },
  md5: hash('md5'),
  sha1: hash('sha1'),
  sha256: hash('sha256'),
  hmac_sha1: hmac('sha1'),
  hmac_sha256: hmac('sha256'),
  base64_encode: (v) => Buffer.from(String(toValue(v) ?? '')).toString('base64'),
  base64_decode: (v) => Buffer.from(String(toValue(v) ?? ''), 'base64').toString('utf8'),
  base64_url_safe_encode: (v) => Buffer.from(String(toValue(v) ?? '')).toString('base64url'),
  base64_url_safe_decode: (v) => Buffer.from(String(toValue(v) ?? ''), 'base64url').toString('utf8'),
  font_face: unsupported('font_face', () => ''),
  font_url: unsupported('font_url', () => ''),
  font_modify: unsupported('font_modify'),
  metafield_tag: metafieldTag,
  metafield_text: metafieldText,
  media_tag: mediaTag,
  video_tag: unsupported('video_tag', () => ''),
  external_video_tag: unsupported('external_video_tag', () => ''),
  external_video_url: unsupported('external_video_url', () => ''),
  model_viewer_tag: unsupported('model_viewer_tag', () => ''),
  item_count_for_variant: (cart, variantId) =>
    (cart?.items ?? []).filter((i) => i.variant_id === Number(toValue(variantId))).reduce((s, i) => s + i.quantity, 0),
  line_items_for: (cart, object) =>
    (cart?.items ?? []).filter((i) => i.product_id === object?.id || i.variant_id === object?.id),
  customer_login_link(text) {
    return `<a href="${root(this)}/account/login" id="customer_login_link">${toValue(text)}</a>`;
  },
  customer_logout_link(text) {
    return `<a href="${root(this)}/account/logout" id="customer_logout_link">${toValue(text)}</a>`;
  },
  customer_register_link(text) {
    return `<a href="${root(this)}/account/register" id="customer_register_link">${toValue(text)}</a>`;
  },
  default_errors: (errors) => {
    const list = toValue(errors);
    if (!list || (Array.isArray(list) && !list.length)) return '';
    const messages = Array.isArray(list) ? list : Object.values(list);
    return `<div class="errors"><ul>${messages.map((m) => `<li>${escapeHtml(toValue(m))}</li>`).join('')}</ul></div>`;
  },
  avatar: unsupported('avatar', () => ''),
  // Shopify renders its own dynamic checkout buttons here (wallets, or an unbranded "Buy it now").
  // The stand-in is the unbranded button, so its styling shows; the label only approximates Shopify's.
  payment_button: unsupported('payment_button', function () {
    const label = { he: 'קנו עכשיו', ar: 'اشترِ الآن' }[stateOf(this.context)?.locale] ?? 'Buy it now';
    return (
      '<div data-shopify="payment-button" class="shopify-payment-button">' +
      `<button type="button" class="shopify-payment-button__button shopify-payment-button__button--unbranded">${label}</button>` +
      '</div>'
    );
  }),
  login_button: unsupported('login_button', () => ''),
  unit_price_with_measurement: unsupported('unit_price_with_measurement'),
  divided_by: dividedBy,
  default: defaultFilter,
  size,
  first,
  last,
};

/** Registers the filters and makes unknown filter names report a gap instead of being ignored. */
export function installFilters(liquid) {
  for (const [name, fn] of Object.entries(SHOPIFY_FILTERS)) liquid.registerFilter(name, fn);
  const known = liquid.filters;
  liquid.filters = new Proxy(known, {
    get(target, name) {
      if (typeof name !== 'string' || name in target) return target[name];
      return function unknownFilter(value) {
        gap(this, 'filter', `unknown filter "${name}" (returned its input unchanged)`);
        return value;
      };
    },
  });
}
