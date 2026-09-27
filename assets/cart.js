/**
 * SportWear cart: the cart drawer (sections/cart-drawer.liquid) and the cart page
 * (sections/main-cart.liquid).
 *
 * Both render <sw-cart data-section-id="…"> with the same markup inside [data-cart-content].
 * Every change goes through CartAPI (assets/core.js); the section HTML it returns (Section Rendering
 * API) replaces [data-cart-content]. No cart HTML is built here.
 *
 * - Quantity clicks are debounced per line and cart requests run one at a time, so every request
 *   starts from the cart the previous one left.
 * - After a re-render, focus returns to the same control ([data-cart-focus]), or to the next line
 *   when a line was removed, and the result is announced to screen readers.
 * - Changes made elsewhere (product form, quick add) re-render the cart, and open the drawer when
 *   they add a product.
 */
import {
  EVENTS,
  CART_BUBBLE_SECTION,
  CartAPI,
  announce,
  closeDrawer,
  config,
  fetchSections,
  openDrawer,
  parseHTML,
  publish,
  subscribe,
} from '@theme/core';

const DRAWER_ID = 'CartDrawer';
const DRAWER_SECTION = 'cart-drawer';
/** Source of every change made from inside the cart; the cart views re-render those themselves. */
const SOURCE = 'cart';
/** Changes from other components that open the drawer. */
const OPENING_SOURCES = new Set(['product-form', 'quick-add', 'set']);
const QUANTITY_DELAY = 300;
const NOTE_DELAY = 600;

/**
 * @typedef {object} PendingQuantity
 * @property {number} quantity - the quantity the customer asked for
 * @property {number} timer - debounce timer; 0 once the change is queued
 *
 * @typedef {object} ViewState - what a re-render must not lose
 * @property {{ key: string, control: string, lineIndex: number, lineCount: number } | null} focus
 * @property {{ value: string, start: number, end: number } | null} note - the note being typed
 * @property {Map<string, boolean>} open - disclosures by [data-cart-keep-open]
 * @property {Map<string, string>} selects - select values by [data-cart-focus]
 * @property {number[]} scroll - scroll positions of [data-cart-scroll]
 * @property {Map<string, Element>} kept - elements that must survive re-renders, by [data-cart-keep]
 */

/** @type {Set<SwCart>} Cart views on the page (drawer, cart page). */
const views = new Set();

/**
 * Quantities asked for but not confirmed by the server yet, by line item key. Re-applied after
 * every re-render, so a pending click is never visually undone.
 * @type {Map<string, PendingQuantity>}
 */
const pendingQuantities = new Map();

/** @type {string | null} Note text typed but not saved yet. */
let pendingNote = null;
let noteTimer = 0;
let queue = Promise.resolve();

/**
 * Runs cart jobs one after another.
 * @template T
 * @param {() => Promise<T>} job
 * @returns {Promise<T>}
 */
function enqueue(job) {
  const run = queue.then(job);
  queue = run.catch(() => {});
  return run;
}

/** @returns {string[]} */
function sectionIds() {
  return [...new Set([...views].map((view) => view.sectionId))];
}

/**
 * Re-renders every cart view from section HTML, fetching the ones that are missing.
 * @param {Record<string, string | null>} [sections]
 */
async function renderViews(sections = {}) {
  const missing = [];
  for (const view of views) {
    const html = sections[view.sectionId];
    if (html) view.render(html);
    else missing.push(view);
  }
  if (!missing.length) return;
  try {
    const fresh = await fetchSections(missing.map((view) => view.sectionId));
    for (const view of missing) view.render(fresh[view.sectionId]);
  } catch (error) {
    console.error(error);
  }
}

/**
 * Shopify's own message for cart errors (already in the customer's language), else ours.
 * @param {unknown} error
 */
function errorMessage(error) {
  if (error instanceof Error && error.name === 'CartError' && error.message) return error.message;
  return config().strings.cartError ?? '';
}

/**
 * Announces through the drawer's own live region while the drawer is open (the page's region is
 * inert behind a modal dialog), otherwise through the page's region.
 * @param {SwCart} view
 * @param {string} message
 */
function say(view, message) {
  const region = view.querySelector('[data-cart-live]');
  if (!message || !region?.closest('dialog[open]')) {
    announce(message);
    return;
  }
  region.textContent = '';
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}

/**
 * Joins announcement parts as sentences, so screen readers pause between them.
 * @param {...string} parts
 */
function sentences(...parts) {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (/[.!?…]$/.test(part) ? part : `${part}.`))
    .join(' ');
}

/**
 * @param {string} key
 * @param {boolean} busy
 */
function setBusy(key, busy) {
  for (const view of views) {
    const line = view.findLine(key);
    if (!line) continue;
    line.classList.toggle('cart-item--busy', busy);
    if (busy) line.setAttribute('aria-busy', 'true');
    else line.removeAttribute('aria-busy');
  }
}

/**
 * Hides an error slot and empties it: a hidden element referenced by aria-describedby would still
 * be read out.
 * @param {Element | null | undefined} slot
 */
function clearError(slot) {
  if (!(slot instanceof HTMLElement)) return;
  slot.hidden = true;
  const text = slot.querySelector('[data-cart-error-text]') ?? slot;
  text.textContent = '';
}

/**
 * @param {HTMLInputElement} input
 * @param {number} value
 */
function clampQuantity(input, value) {
  const max = input.max ? Number(input.max) : Infinity;
  return Math.min(Math.max(0, Math.floor(value)), max);
}

/* ------------------------------------------------------------------------------------------------
 * Line quantities
 * ---------------------------------------------------------------------------------------------- */

/**
 * Remembers the quantity for a line and sends it after a short pause, so several clicks become one
 * request.
 * @param {SwCart} view - where the customer made the change (errors and announcements go there)
 * @param {string} key - line item key
 * @param {number} quantity
 * @param {number} delay - ms
 */
function scheduleQuantity(view, key, quantity, delay) {
  const previous = pendingQuantities.get(key);
  if (previous) window.clearTimeout(previous.timer);
  /** @type {PendingQuantity} */
  const entry = { quantity, timer: 0 };
  entry.timer = window.setTimeout(() => {
    entry.timer = 0;
    enqueue(() => changeLine(view, key, entry));
  }, delay);
  pendingQuantities.set(key, entry);
}

/**
 * @param {SwCart} view
 * @param {string} key
 * @param {PendingQuantity} entry
 */
async function changeLine(view, key, entry) {
  // A newer click replaced this change; it sends its own request.
  if (pendingQuantities.get(key) !== entry) return;
  const settle = () => {
    if (pendingQuantities.get(key) === entry) pendingQuantities.delete(key);
  };

  const line = view.findLine(key);
  if (!line) {
    settle();
    await renderViews();
    return;
  }
  const lineKey = line.dataset.key ?? key;
  const name = line.dataset.name ?? '';
  const { quantity } = entry;
  setBusy(lineKey, true);

  try {
    // The line item key identifies the line, as Shopify recommends: unlike the line number it stays
    // right even if the lines were reordered since the last render (another tab, another change).
    const { cart, sections } = await CartAPI.change(
      { id: lineKey, quantity },
      { sections: sectionIds(), source: SOURCE },
    );
    settle();
    await renderViews(sections);

    const updated = cart.items?.find((item) => item.key === lineKey);
    if (quantity > 0 && updated && updated.quantity < quantity) {
      const message = view.message('maxQuantityMessage', '[quantity]', String(updated.quantity));
      view.showLineError(updated.key, message);
      say(view, message);
      return;
    }
    const status = view.statusText();
    say(view, quantity === 0 ? sentences(view.message('removedMessage', '[title]', name), status) : status);
  } catch (error) {
    settle();
    const message = errorMessage(error);
    await renderViews();
    view.showLineError(lineKey, message);
    say(view, message);
  } finally {
    setBusy(lineKey, false);
  }
}

/* ------------------------------------------------------------------------------------------------
 * Set suggestions and order note
 * ---------------------------------------------------------------------------------------------- */

/**
 * @param {SwCart} view
 * @param {HTMLFormElement} form
 */
async function addSuggestion(view, form) {
  const formData = new FormData(form);
  const variantId = String(formData.get('id') ?? '');
  try {
    const { sections } = await CartAPI.add(formData, { sections: sectionIds(), source: SOURCE });
    await renderViews(sections);
    view.focusVariant(variantId);
    say(view, sentences(config().strings.addedToCart ?? '', view.statusText()));
  } catch (error) {
    const message = errorMessage(error);
    const current = (form.id && document.getElementById(form.id)) || form;
    const slot = current.parentElement?.querySelector('[data-cart-upsell-error]');
    if (slot instanceof HTMLElement) {
      slot.textContent = message;
      slot.hidden = false;
    }
    current.querySelector('[type="submit"]')?.removeAttribute('aria-busy');
    say(view, message);
  }
}

/**
 * @param {SwCart} view
 * @param {string} value
 */
function scheduleNote(view, value) {
  pendingNote = value;
  window.clearTimeout(noteTimer);
  noteTimer = window.setTimeout(() => saveNote(view), NOTE_DELAY);
}

/**
 * Saves the typed note now (pause elapsed, or the field lost focus).
 * @param {SwCart} view
 */
function saveNote(view) {
  window.clearTimeout(noteTimer);
  if (pendingNote === null) return;
  const note = pendingNote;
  pendingNote = null;
  enqueue(async () => {
    try {
      await CartAPI.update({ note }, { sections: [], source: SOURCE });
      for (const other of views) other.syncNote(note);
    } catch (error) {
      say(view, errorMessage(error));
    }
  });
}

/* ------------------------------------------------------------------------------------------------
 * <sw-cart>
 * ---------------------------------------------------------------------------------------------- */

class SwCart extends HTMLElement {
  /** @type {AbortController | null} */
  #listeners = null;

  get sectionId() {
    return this.dataset.sectionId ?? '';
  }

  connectedCallback() {
    this.#listeners = new AbortController();
    const options = { signal: this.#listeners.signal };
    this.addEventListener('click', this.#onClick, options);
    this.addEventListener('change', this.#onChange, options);
    this.addEventListener('keydown', this.#onKeydown, options);
    this.addEventListener('input', this.#onInput, options);
    this.addEventListener('submit', this.#onSubmit, options);
    views.add(this);
  }

  disconnectedCallback() {
    this.#listeners?.abort();
    views.delete(this);
  }

  /**
   * Replaces the content with the same part of fresh section HTML, keeping focus, scroll position,
   * open disclosures, pending quantities and the note being typed.
   * @param {string | null | undefined} html
   */
  render(html) {
    const content = this.querySelector('[data-cart-content]');
    const next = html ? parseHTML(html).querySelector('[data-cart-content]') : null;
    if (!content || !next) return;
    const state = this.#captureState();
    content.replaceChildren(...next.childNodes);
    this.#restoreState(state);
  }

  /**
   * The line for a key. When Shopify re-keyed the line (it does when discounts change), the only
   * line with the same variant.
   * @param {string} key
   * @returns {HTMLElement | null}
   */
  findLine(key) {
    const exact = this.querySelector(`[data-cart-line][data-key="${CSS.escape(key)}"]`);
    if (exact instanceof HTMLElement) return exact;
    const variantId = key.split(':')[0];
    const matches = this.querySelectorAll(`[data-cart-line][data-variant-id="${CSS.escape(variantId)}"]`);
    return matches.length === 1 && matches[0] instanceof HTMLElement ? matches[0] : null;
  }

  /** Screen-reader summary of the rendered cart: item count, subtotal, free-shipping progress. */
  statusText() {
    return sentences(
      ...['[data-cart-status]', '[data-free-shipping-message]'].map(
        (selector) => this.querySelector(selector)?.textContent ?? '',
      ),
    );
  }

  /**
   * A translated message printed in a data attribute, with its placeholder filled in.
   * @param {'removedMessage' | 'maxQuantityMessage'} name
   * @param {string} placeholder
   * @param {string} value
   */
  message(name, placeholder, value) {
    return (this.dataset[name] ?? '').replace(placeholder, value);
  }

  /**
   * @param {string} key
   * @param {string} message
   */
  showLineError(key, message) {
    const slot = this.findLine(key)?.querySelector('[data-cart-line-error]');
    const text = slot?.querySelector('[data-cart-error-text]');
    if (slot instanceof HTMLElement && text) {
      text.textContent = message;
      slot.hidden = false;
      return;
    }
    const alert = this.querySelector('[data-cart-error]');
    if (alert instanceof HTMLElement) {
      alert.textContent = message;
      alert.hidden = false;
    }
  }

  /**
   * Moves focus to the line just added from a set suggestion.
   * @param {string} variantId
   */
  focusVariant(variantId) {
    if (!variantId || !this.contains(document.activeElement)) return;
    const line = this.querySelector(`[data-cart-line][data-variant-id="${CSS.escape(variantId)}"]`);
    const title = line?.querySelector('[data-cart-control="title"]');
    if (title instanceof HTMLElement) title.focus();
  }

  /** @param {string} note */
  syncNote(note) {
    const field = this.querySelector('[data-cart-note]');
    if (field instanceof HTMLTextAreaElement && field !== document.activeElement) field.value = note;
  }

  /** @param {MouseEvent} event */
  #onClick = (event) => {
    const target = /** @type {Element} */ (event.target);
    const step = target.closest('[data-cart-step]');
    if (step instanceof HTMLElement) {
      const line = step.closest('[data-cart-line]');
      const input = line?.querySelector('[data-cart-quantity]');
      if (!(line instanceof HTMLElement) || !(input instanceof HTMLInputElement)) return;
      const increment = Number(input.step) || 1;
      const next = clampQuantity(input, (Number(input.value) || 0) + Number(step.dataset.cartStep) * increment);
      input.value = String(next);
      this.#setQuantity(line, next, QUANTITY_DELAY);
      return;
    }
    const line = target.closest('[data-cart-remove]')?.closest('[data-cart-line]');
    if (line instanceof HTMLElement) {
      event.preventDefault();
      this.#setQuantity(line, 0, 0);
    }
  };

  /**
   * Typed quantities are sent once the field is committed (blur or Enter); the note is saved on blur.
   * @param {Event} event
   */
  #onChange = (event) => {
    const field = event.target;
    if (field instanceof HTMLTextAreaElement && field.matches('[data-cart-note]')) {
      saveNote(this);
      return;
    }
    if (!(field instanceof HTMLInputElement) || !field.matches('[data-cart-quantity]')) return;
    const line = field.closest('[data-cart-line]');
    if (!(line instanceof HTMLElement)) return;
    const value = Number.parseInt(field.value, 10);
    if (Number.isNaN(value)) {
      const pending = pendingQuantities.get(line.dataset.key ?? '');
      field.value = pending ? String(pending.quantity) : field.defaultValue;
      return;
    }
    const next = clampQuantity(field, value);
    field.value = String(next);
    this.#setQuantity(line, next, 0);
  };

  /**
   * Enter in a quantity field applies it instead of submitting the cart form (which checks out).
   * @param {KeyboardEvent} event
   */
  #onKeydown = (event) => {
    const field = event.target;
    if (event.key !== 'Enter' || !(field instanceof HTMLInputElement) || !field.matches('[data-cart-quantity]')) {
      return;
    }
    event.preventDefault();
    this.#onChange(event);
  };

  /** @param {Event} event */
  #onInput = (event) => {
    const field = event.target;
    if (field instanceof HTMLTextAreaElement && field.matches('[data-cart-note]')) scheduleNote(this, field.value);
  };

  /**
   * Set suggestions are added through CartAPI instead of leaving the page.
   * @param {SubmitEvent} event
   */
  #onSubmit = (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('[data-cart-upsell]')) return;
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    if (button?.getAttribute('aria-busy') === 'true') return;
    button?.setAttribute('aria-busy', 'true');
    clearError(form.parentElement?.querySelector('[data-cart-upsell-error]'));
    enqueue(() => addSuggestion(this, form));
  };

  /**
   * @param {HTMLElement} line
   * @param {number} quantity
   * @param {number} delay - ms
   */
  #setQuantity(line, quantity, delay) {
    const key = line.dataset.key;
    if (!key) return;
    clearError(line.querySelector('[data-cart-line-error]'));
    const pending = pendingQuantities.get(key);
    // Already scheduled or sent.
    if (pending?.quantity === quantity) return;
    const input = line.querySelector('[data-cart-quantity]');
    const confirmed = input instanceof HTMLInputElement ? Number(input.defaultValue) : Number.NaN;
    // Back to the confirmed quantity before anything was sent: cancel instead of sending.
    if (quantity === confirmed && (!pending || pending.timer)) {
      if (pending) window.clearTimeout(pending.timer);
      pendingQuantities.delete(key);
      return;
    }
    scheduleQuantity(this, key, quantity, delay);
  }

  /** @returns {ViewState} */
  #captureState() {
    const focused = document.activeElement;
    const active = focused instanceof HTMLElement && this.contains(focused) ? focused : null;
    const lines = [...this.querySelectorAll('[data-cart-line]')];
    const line = active?.closest('[data-cart-line]');
    const note = this.querySelector('[data-cart-note]');
    /** @param {string} selector @param {string} name */
    const elements = (selector, name) =>
      [...this.querySelectorAll(selector)].filter((el) => el instanceof HTMLElement && el.dataset[name]);

    return {
      focus: active && {
        key: active.dataset.cartFocus ?? '',
        control: active.dataset.cartControl ?? '',
        lineIndex: line ? lines.indexOf(line) : -1,
        lineCount: lines.length,
      },
      note:
        note instanceof HTMLTextAreaElement && note === active
          ? { value: note.value, start: note.selectionStart, end: note.selectionEnd }
          : null,
      open: new Map(
        elements('details[data-cart-keep-open]', 'cartKeepOpen').map((el) => [
          el.dataset.cartKeepOpen,
          /** @type {HTMLDetailsElement} */ (el).open,
        ]),
      ),
      selects: new Map(
        elements('select[data-cart-focus]', 'cartFocus').map((el) => [
          el.dataset.cartFocus,
          /** @type {HTMLSelectElement} */ (el).value,
        ]),
      ),
      scroll: [...this.querySelectorAll('[data-cart-scroll]')].map((el) => el.scrollTop),
      kept: new Map(elements('[data-cart-keep]', 'cartKeep').map((el) => [el.dataset.cartKeep, el])),
    };
  }

  /** @param {ViewState} state */
  #restoreState(state) {
    for (const el of this.querySelectorAll('[data-cart-keep]')) {
      // Third-party widgets (accelerated checkout buttons) keep their initialised element.
      const kept = state.kept.get(/** @type {HTMLElement} */ (el).dataset.cartKeep ?? '');
      if (kept) el.replaceWith(kept);
    }
    for (const el of this.querySelectorAll('details[data-cart-keep-open]')) {
      const open = state.open.get(/** @type {HTMLElement} */ (el).dataset.cartKeepOpen ?? '');
      if (open !== undefined) /** @type {HTMLDetailsElement} */ (el).open = open;
    }
    for (const el of this.querySelectorAll('select[data-cart-focus]')) {
      const select = /** @type {HTMLSelectElement} */ (el);
      const value = state.selects.get(select.dataset.cartFocus ?? '');
      const option = [...select.options].find((item) => item.value === value);
      if (option && !option.disabled) select.value = option.value;
    }
    for (const [key, entry] of pendingQuantities) {
      const input = this.findLine(key)?.querySelector('[data-cart-quantity]');
      if (input instanceof HTMLInputElement) input.value = String(entry.quantity);
    }
    const note = this.querySelector('[data-cart-note]');
    if (note instanceof HTMLTextAreaElement) {
      if (state.note) note.value = state.note.value;
      else if (pendingNote !== null) note.value = pendingNote;
    }
    for (const [index, el] of [...this.querySelectorAll('[data-cart-scroll]')].entries()) {
      el.scrollTop = state.scroll[index] ?? 0;
    }
    if (state.focus) this.#restoreFocus(state.focus, state.note);
  }

  /**
   * The same control as before; if its line is gone, the line that took its place, else the heading.
   * @param {NonNullable<ViewState['focus']>} focus
   * @param {ViewState['note']} note
   */
  #restoreFocus(focus, note) {
    let target = focus.key ? this.querySelector(`[data-cart-focus="${CSS.escape(focus.key)}"]`) : null;
    if (!target && focus.lineIndex >= 0) {
      const lines = this.querySelectorAll('[data-cart-line]');
      const line = lines[Math.min(focus.lineIndex, lines.length - 1)];
      // Same number of lines: the line was re-keyed, keep the same control. Otherwise it was removed.
      const control = lines.length === focus.lineCount && focus.control ? focus.control : 'title';
      target = line?.querySelector(`[data-cart-control="${control}"]`) ?? null;
    }
    target ??= this.querySelector('[data-cart-focus-fallback]');
    if (!(target instanceof HTMLElement)) return;
    target.focus();
    if (note && target instanceof HTMLTextAreaElement) target.setSelectionRange(note.start, note.end);
  }
}

if (!customElements.get('sw-cart')) customElements.define('sw-cart', SwCart);

/* ------------------------------------------------------------------------------------------------
 * Changes made elsewhere, back/forward cache, theme editor
 * ---------------------------------------------------------------------------------------------- */

subscribe(EVENTS.cartUpdated, ({ sections, source }) => {
  if (source === SOURCE) return;
  enqueue(async () => {
    await renderViews(sections ?? {});
    if (OPENING_SOURCES.has(source) && config().cartType !== 'page') openDrawer(DRAWER_ID);
  });
});

// A page restored from the back/forward cache shows the cart as it was when the customer left it
// (for example before checking out). Refresh the cart views and, through the event, the header count.
window.addEventListener('pageshow', (event) => {
  if (!event.persisted || !views.size) return;
  enqueue(async () => {
    try {
      const [cart, sections] = await Promise.all([
        CartAPI.get(),
        fetchSections([CART_BUBBLE_SECTION, ...sectionIds()]),
      ]);
      publish(EVENTS.cartUpdated, { cart, sections, source: 'cart-sync' });
    } catch (error) {
      console.error(error);
    }
  });
});

// Theme editor: show the drawer while its section is selected.
if (config().designMode) {
  let drawerSelected = false;
  /**
   * @param {string} type
   * @param {() => void} handler
   */
  const onDrawerSection = (type, handler) => {
    document.addEventListener(type, (event) => {
      if (/** @type {CustomEvent} */ (event).detail?.sectionId === DRAWER_SECTION) handler();
    });
  };
  onDrawerSection('shopify:section:select', () => {
    drawerSelected = true;
    openDrawer(DRAWER_ID);
  });
  onDrawerSection('shopify:section:deselect', () => {
    drawerSelected = false;
    closeDrawer(DRAWER_ID);
  });
  onDrawerSection('shopify:section:load', () => {
    if (drawerSelected) openDrawer(DRAWER_ID);
  });
}
