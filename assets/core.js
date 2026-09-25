/**
 * SportWear core module: shared utilities for every theme component.
 * Loaded on every page (import map name "@theme/core"). Components import what they need:
 *
 *   import { CartAPI, subscribe, EVENTS } from '@theme/core';
 *
 * Contents: config access, a tiny pub/sub on document events, Section Rendering API helpers,
 * the Cart AJAX API wrapper, a screen-reader announcer, and the <sw-drawer> dialog element.
 */

/** Custom event names used across components. */
export const EVENTS = Object.freeze({
  /** detail: { cart, sections, source } after any successful cart change */
  cartUpdated: 'sw:cart:updated',
  /** detail: { message, source } when a cart request fails */
  cartError: 'sw:cart:error',
  /** detail: { sectionId, variant } when a product form selects another variant */
  variantChanged: 'sw:variant:changed',
  /** detail: { id } when a drawer opens / closes */
  drawerOpen: 'sw:drawer:open',
  drawerClose: 'sw:drawer:close',
});

/** Section rendered on every cart change so the header count stays in sync. */
export const CART_BUBBLE_SECTION = 'cart-bubble';

/**
 * Theme configuration printed by layout/theme.liquid (routes, strings, cart type).
 * @returns {{ routes: Record<string, string>, strings: Record<string, string>, cartType: string, designMode: boolean }}
 */
export function config() {
  return window.theme ?? { routes: {}, strings: {}, cartType: 'drawer', designMode: false };
}

/**
 * @param {string} name - one of EVENTS
 * @param {object} [detail]
 */
export function publish(name, detail = {}) {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}

/**
 * @param {string} name - one of EVENTS
 * @param {(detail: any, event: CustomEvent) => void} callback
 * @returns {() => void} unsubscribe
 */
export function subscribe(name, callback) {
  const handler = (event) => callback(event.detail, event);
  document.addEventListener(name, handler);
  return () => document.removeEventListener(name, handler);
}

/**
 * @template {(...args: any[]) => void} T
 * @param {T} fn
 * @param {number} [wait]
 * @returns {T}
 */
export function debounce(fn, wait = 250) {
  let timer;
  return /** @type {T} */ (
    (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    }
  );
}

/** @param {string} html */
export function parseHTML(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

/**
 * Renders several sections for a URL in one request (Section Rendering API).
 * @param {string[]} sectionIds
 * @param {string} [url] - page to render them for (defaults to the current page)
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<Record<string, string>>} section id -> HTML
 */
export async function fetchSections(sectionIds, url = window.location.href, { signal } = {}) {
  const target = new URL(url, window.location.origin);
  target.searchParams.set('sections', sectionIds.join(','));
  const response = await fetch(target, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Section request failed (${response.status})`);
  return response.json();
}

/**
 * Renders one section for a URL and returns its HTML (Section Rendering API).
 * @param {string} sectionId
 * @param {string} [url]
 * @param {{ signal?: AbortSignal }} [options]
 */
export async function fetchSection(sectionId, url = window.location.href, { signal } = {}) {
  const target = new URL(url, window.location.origin);
  target.searchParams.set('section_id', sectionId);
  const response = await fetch(target, { signal });
  if (!response.ok) throw new Error(`Section request failed (${response.status})`);
  return response.text();
}

/**
 * Replaces the children of `target` with the children of the element that matches `selector`
 * in `html`. Keeps `target` itself (and its listeners) in place.
 * @param {Element | null} target
 * @param {string} html
 * @param {string} selector
 * @returns {boolean} whether anything was replaced
 */
export function replaceContent(target, html, selector) {
  if (!target || !html) return false;
  const source = parseHTML(html).querySelector(selector);
  if (!source) return false;
  target.replaceChildren(...source.childNodes);
  return true;
}

/**
 * Announces a message to screen readers through the page's polite live region.
 * @param {string} message
 */
export function announce(message) {
  const region = document.getElementById('SwLiveRegion');
  if (!region || !message) return;
  region.textContent = '';
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}

/** @returns {boolean} */
export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ---------------------------------------------------------------------------------------------
 * Cart AJAX API
 * Every mutation also renders the "cart-bubble" section plus any sections the caller asks for,
 * then publishes EVENTS.cartUpdated with { cart, sections, source }.
 * ------------------------------------------------------------------------------------------- */

class CartError extends Error {
  /** @param {string} message @param {number} status */
  constructor(message, status) {
    super(message);
    this.name = 'CartError';
    this.status = status;
  }
}

/** @param {Response} response */
async function readCartResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.status) {
    const message = data.description || data.message || config().strings.cartError || 'Cart error';
    throw new CartError(message, response.status);
  }
  return data;
}

/** @param {string[]} sections */
function sectionsFor(sections) {
  return [...new Set([CART_BUBBLE_SECTION, ...sections])];
}

/**
 * @param {() => Promise<{ cart: any, sections: Record<string, string> }>} request
 * @param {string} source
 */
async function runCartMutation(request, source) {
  try {
    const result = await request();
    publish(EVENTS.cartUpdated, { ...result, source });
    return result;
  } catch (error) {
    publish(EVENTS.cartError, { message: error.message, source });
    throw error;
  }
}

export const CartAPI = {
  /** @returns {Promise<any>} the cart JSON */
  async get() {
    const response = await fetch(`${config().routes.cart_url}.js`, { headers: { Accept: 'application/json' } });
    return readCartResponse(response);
  },

  /**
   * Adds items from a product form (FormData with id + quantity, or items[]).
   * @param {FormData} formData
   * @param {{ sections?: string[], source?: string }} [options]
   */
  add(formData, { sections = [], source = 'unknown' } = {}) {
    return runCartMutation(async () => {
      const ids = sectionsFor(sections);
      formData.set('sections', ids.join(','));
      formData.set('sections_url', window.location.pathname);
      const response = await fetch(`${config().routes.cart_add_url}.js`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: formData,
      });
      const added = await readCartResponse(response);
      const cart = await this.get();
      return { cart, sections: added.sections ?? {}, added };
    }, source);
  },

  /**
   * Changes the quantity of one line (1-based line index or line item key).
   * @param {{ line?: number, id?: string, quantity: number }} change
   * @param {{ sections?: string[], source?: string }} [options]
   */
  change(change, { sections = [], source = 'unknown' } = {}) {
    return runCartMutation(async () => {
      const response = await fetch(`${config().routes.cart_change_url}.js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          ...change,
          sections: sectionsFor(sections),
          sections_url: window.location.pathname,
        }),
      });
      const cart = await readCartResponse(response);
      return { cart, sections: cart.sections ?? {} };
    }, source);
  },

  /**
   * Updates several quantities and/or the cart note at once.
   * @param {{ updates?: Record<string, number>, note?: string, attributes?: Record<string, string> }} body
   * @param {{ sections?: string[], source?: string }} [options]
   */
  update(body, { sections = [], source = 'unknown' } = {}) {
    return runCartMutation(async () => {
      const response = await fetch(`${config().routes.cart_update_url}.js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          ...body,
          sections: sectionsFor(sections),
          sections_url: window.location.pathname,
        }),
      });
      const cart = await readCartResponse(response);
      return { cart, sections: cart.sections ?? {} };
    }, source);
  },
};

// Keep every header cart count in sync, whatever triggered the change.
subscribe(EVENTS.cartUpdated, ({ sections }) => {
  const html = sections?.[CART_BUBBLE_SECTION];
  if (!html) return;
  for (const bubble of document.querySelectorAll('[data-cart-bubble]')) {
    replaceContent(bubble, html, '[data-cart-bubble]');
  }
});

/* ---------------------------------------------------------------------------------------------
 * <sw-drawer>: wraps a <dialog> used as a side drawer or modal.
 *
 *   <sw-drawer id="CartDrawer">
 *     <dialog class="drawer" aria-labelledby="CartDrawerTitle">
 *       ... <button type="button" data-drawer-close aria-label="…">…</button> ...
 *     </dialog>
 *   </sw-drawer>
 *   <button type="button" data-drawer-open="CartDrawer" aria-haspopup="dialog" aria-expanded="false">…</button>
 *
 * showModal() gives focus trapping, Escape to close and an inert page for free; this element adds
 * backdrop-click closing, opener focus restore, aria-expanded sync and open/close events.
 * ------------------------------------------------------------------------------------------- */

class SwDrawer extends HTMLElement {
  /** @type {HTMLElement | null} */
  #opener = null;

  get dialog() {
    return /** @type {HTMLDialogElement | null} */ (this.querySelector(':scope > dialog'));
  }

  get isOpen() {
    return Boolean(this.dialog?.open);
  }

  connectedCallback() {
    this.dialog?.addEventListener('click', this.#onClick);
    this.dialog?.addEventListener('close', this.#onClose);
  }

  disconnectedCallback() {
    this.dialog?.removeEventListener('click', this.#onClick);
    this.dialog?.removeEventListener('close', this.#onClose);
  }

  /** @param {HTMLElement | null} [opener] */
  open(opener = null) {
    const dialog = this.dialog;
    if (!dialog || dialog.open) return;
    this.#opener = opener ?? /** @type {HTMLElement | null} */ (document.activeElement);
    dialog.showModal();
    this.#syncTriggers(true);
    publish(EVENTS.drawerOpen, { id: this.id });
  }

  close() {
    this.dialog?.close();
  }

  /** @param {MouseEvent} event */
  #onClick = (event) => {
    const target = /** @type {Element} */ (event.target);
    if (target.closest('[data-drawer-close]')) {
      this.close();
      return;
    }
    if (target !== this.dialog) return;
    const rect = this.dialog.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (!inside) this.close();
  };

  #onClose = () => {
    this.#syncTriggers(false);
    const opener = this.#opener;
    this.#opener = null;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    publish(EVENTS.drawerClose, { id: this.id });
  };

  /** @param {boolean} expanded */
  #syncTriggers(expanded) {
    for (const trigger of document.querySelectorAll(`[data-drawer-open="${this.id}"]`)) {
      trigger.setAttribute('aria-expanded', String(expanded));
    }
  }
}

if (!customElements.get('sw-drawer')) customElements.define('sw-drawer', SwDrawer);

document.addEventListener('click', (event) => {
  const trigger = /** @type {Element} */ (event.target).closest('[data-drawer-open]');
  if (!(trigger instanceof HTMLElement)) return;
  const drawer = document.getElementById(trigger.dataset.drawerOpen ?? '');
  if (!(drawer instanceof SwDrawer)) return;
  event.preventDefault();
  drawer.open(trigger);
});

/**
 * Opens a drawer by id from code (e.g. the cart drawer after adding a product).
 * @param {string} id
 * @param {HTMLElement | null} [opener]
 */
export function openDrawer(id, opener = null) {
  const drawer = document.getElementById(id);
  if (drawer instanceof SwDrawer) drawer.open(opener);
}

/** @param {string} id */
export function closeDrawer(id) {
  const drawer = document.getElementById(id);
  if (drawer instanceof SwDrawer) drawer.close();
}
