// Gap log: everything the harness could not emulate faithfully (unknown filters, unknown object
// properties, missing translations, missing files, Liquid errors, substituted images...).
// Gaps are never silent: each page lists them in a visible bar at the end of <body> and logs them
// with console.warn('[preview-gap] ...'), and render.mjs writes them to render-report.json.

/** Key under which the per-page render state is stored in Liquid globals (not reachable from Liquid). */
export const STATE = Symbol.for('sw-preview.state');
/** Key under which the current block container (section or theme block) is stored in Liquid globals. */
export const CONTAINER = Symbol.for('sw-preview.container');

export const GAP_KINDS = {
  'liquid-error': 'Liquid error while rendering (Shopify would print the same kind of inline error)',
  'missing-file': 'A template, section, block or snippet file does not exist',
  translation: 'Translation key missing in every locale file',
  'translation-fallback': 'Translation key missing in this locale; the default locale string was used',
  filter: 'Filter unknown to the harness (may be a typo or an unsupported Shopify filter)',
  property: 'Object property the mock does not provide (may be a typo or unsupported)',
  object: 'Shopify global object the harness does not mock',
  setting: 'Setting id that is not defined in the schema',
  resource: 'Resource (collection, product, menu, page...) not in the mock catalog',
  image: 'Image reference not available locally; a fixture image was substituted',
  unsupported: 'Shopify feature the harness does not emulate',
  schema: 'Invalid or missing {% schema %} JSON',
};

export class GapLog {
  constructor() {
    this.entries = new Map();
  }

  add(kind, message, where) {
    const key = `${kind}|${message}`;
    const entry = this.entries.get(key);
    if (entry) {
      entry.count += 1;
      if (where && !entry.where.includes(where) && entry.where.length < 6) entry.where.push(where);
      return entry;
    }
    const created = { kind, message, where: where ? [where] : [], count: 1 };
    this.entries.set(key, created);
    return created;
  }

  list() {
    return [...this.entries.values()];
  }

  get size() {
    return this.entries.size;
  }
}

/** @returns {any} the page render state for a LiquidJS context, or null */
export function stateOf(ctx) {
  return ctx?.globals?.[STATE] ?? null;
}

export function reportGap(ctx, kind, message) {
  stateOf(ctx)?.gap(kind, message);
}
