// Liquid drops that mimic Shopify objects. Every drop reports reads of properties it does not
// define (liquidMethodMissing), so a typo or an unsupported property shows up as a gap instead of
// silently rendering nothing.
import { Drop } from 'liquidjs';
import { reportGap } from './gaps.mjs';
import { formatAlpha, parseColor, rgbToHsl } from './util.mjs';

export const KIND = Symbol('sw-preview.kind');
const WINDOWS = Symbol('sw-preview.windows');

/** Defines props (keeping getters lazy) and hidden (non-enumerable, so JSON never loops). */
function assignProps(target, props, hidden) {
  Object.defineProperties(target, Object.getOwnPropertyDescriptors(props));
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(hidden))) {
    Object.defineProperty(target, key, { ...descriptor, enumerable: false, configurable: true });
  }
}

export class BaseDrop extends Drop {
  /**
   * @param {string} kind - Shopify object name, used in gap messages
   * @param {object} [props] - properties (getters stay lazy)
   * @param {object} [hidden] - properties kept out of JSON (back references)
   */
  constructor(kind, props = {}, hidden = {}) {
    super();
    Object.defineProperty(this, KIND, { value: kind });
    Object.defineProperty(this, WINDOWS, { value: new Map() });
    assignProps(this, props, hidden);
  }

  liquidMethodMissing(key, ctx) {
    if (typeof key !== 'string' || /^\d+$/.test(key)) return undefined;
    reportGap(ctx, 'property', `${this[KIND]}.${key} is not provided by the preview mock`);
    return undefined;
  }

  toString() {
    return `${this[KIND]}`;
  }
}

/** Paginate support: {% paginate %} sets a window on the drop that owns the paginated list. */
export function setWindow(drop, key, window) {
  drop?.[WINDOWS]?.set(key, window);
}

export function clearWindow(drop, key) {
  drop?.[WINDOWS]?.delete(key);
}

export function windowed(drop, key, list) {
  const window = drop?.[WINDOWS]?.get(key);
  if (!window) return list;
  return list.slice(window.offset, window.offset + window.size);
}

/** Ordered, keyed collection: iterates like an array, `drop['key']` looks up by key. */
export class MapDrop extends BaseDrop {
  #map;
  #missing;
  #iterate;

  /**
   * @param {string} kind
   * @param {Map<string, any>} map
   * @param {{ missing?: (key: string, ctx: any) => any, props?: object, iterate?: any[] }} [options]
   *   iterate: what a for loop sees, when it differs from the lookup map (e.g. `collections` hides "all")
   */
  constructor(kind, map, { missing, props = {}, iterate } = {}) {
    super(kind, props);
    this.#map = map;
    this.#missing = missing;
    this.#iterate = iterate;
  }

  get size() {
    return this.#iterate ? this.#iterate.length : this.#map.size;
  }

  get first() {
    return this.valueOf()[0];
  }

  get last() {
    const list = this.valueOf();
    return list[list.length - 1];
  }

  has(key) {
    return this.#map.has(key);
  }

  get values() {
    return [...this.#map.values()];
  }

  valueOf() {
    return windowed(this, '*', this.#iterate ?? [...this.#map.values()]);
  }

  liquidMethodMissing(key, ctx) {
    if (this.#map.has(key)) return this.#map.get(key);
    if (typeof key === 'number') return this.valueOf()[key];
    if (this.#missing) return this.#missing(key, ctx);
    reportGap(ctx, 'resource', `${this[KIND]}['${key}'] is not in the preview mock`);
    return null;
  }

  toJSON() {
    return this.valueOf();
  }
}

/** Settings object: known ids are own properties; reading an unknown id is reported. */
export class SettingsDrop extends BaseDrop {
  #owner;

  constructor(owner, values) {
    super('settings', values);
    this.#owner = owner;
  }

  liquidMethodMissing(key, ctx) {
    if (typeof key !== 'string') return undefined;
    reportGap(ctx, 'setting', `${this.#owner} reads settings.${key}, which is not defined in its schema`);
    return undefined;
  }
}

export class ColorDrop extends BaseDrop {
  #raw;

  constructor(raw) {
    const parsed = parseColor(raw) ?? { red: 0, green: 0, blue: 0, alpha: 1 };
    const hsl = rgbToHsl(parsed);
    super('color', {
      red: parsed.red,
      green: parsed.green,
      blue: parsed.blue,
      alpha: parsed.alpha,
      hue: hsl.hue,
      saturation: hsl.saturation,
      lightness: hsl.lightness,
      rgb: `${parsed.red} ${parsed.green} ${parsed.blue}`,
      rgba: `${parsed.red} ${parsed.green} ${parsed.blue} / ${formatAlpha(parsed.alpha)}`,
    });
    this.#raw = String(raw);
  }

  valueOf() {
    return this.#raw;
  }

  toString() {
    return this.#raw;
  }

  toJSON() {
    return this.#raw;
  }
}

export class ColorSchemeDrop extends BaseDrop {
  constructor(id, settings) {
    super('color_scheme', { id, settings });
  }

  valueOf() {
    return this.id;
  }

  toString() {
    return this.id;
  }

  toJSON() {
    return this.id;
  }
}

/** A drop that prints as a plain value (country prints its name, template its full name, ...). */
export class ValueDrop extends BaseDrop {
  #value;

  constructor(kind, value, props = {}, hidden = {}) {
    super(kind, props, hidden);
    this.#value = value;
  }

  valueOf() {
    return this.#value;
  }

  toString() {
    return String(this.#value ?? '');
  }

  toJSON() {
    return this.#value;
  }
}

/** Product option value: prints as its name. */
export class OptionValueDrop extends BaseDrop {
  valueOf() {
    return this.name;
  }

  toString() {
    return String(this.name);
  }

  toJSON() {
    return this.name;
  }
}

/**
 * Metafield: `.value` is the typed value; printing the metafield prints its value
 * (like Shopify does for text and number types).
 */
export class MetafieldDrop extends BaseDrop {
  constructor(type, value, display) {
    super('metafield', { type, value, 'list?': type.startsWith('list.') });
    Object.defineProperty(this, '__display', { value: display ?? value, enumerable: false });
  }

  valueOf() {
    const display = this.__display;
    if (display instanceof Drop) return String(display);
    return display;
  }

  toString() {
    return String(this.valueOf() ?? '');
  }

  toJSON() {
    const { value } = this;
    return value instanceof Drop && typeof value.toJSON === 'function' ? value.toJSON() : value;
  }
}

/** Namespace of metafields (product.metafields.sportwear). Unknown keys are nil, and reported. */
export class MetafieldNamespaceDrop extends BaseDrop {
  #owner;
  #known;

  constructor(owner, namespace, values, knownKeys) {
    super('metafields', values);
    this.#owner = `${owner}.metafields.${namespace}`;
    this.#known = new Set(knownKeys);
  }

  liquidMethodMissing(key, ctx) {
    if (typeof key !== 'string') return undefined;
    if (!this.#known.has(key)) reportGap(ctx, 'property', `${this.#owner}.${key} is not a defined metafield`);
    return null;
  }
}

export class MetafieldsDrop extends BaseDrop {
  #owner;

  constructor(owner, namespaces) {
    super('metafields', namespaces);
    this.#owner = owner;
  }

  liquidMethodMissing(key, ctx) {
    if (typeof key !== 'string') return undefined;
    reportGap(ctx, 'property', `${this.#owner}.metafields.${key} is not a namespace in the preview mock`);
    return null;
  }
}
