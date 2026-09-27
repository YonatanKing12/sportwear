/**
 * SportWear "complete the set": <sw-set-builder> (sections/promo-banner.liquid).
 *
 * - Team tabs (role="tablist"): a click or the arrow keys (mirrored in right-to-left languages), Home
 *   and End switch the set on show. Non-chosen sets carry data-set-hidden.
 * - Choosing the jersey's size also picks the same size for the shorts while they have none, and says so
 *   in a note under the shorts.
 * - Each set is a cart form (items[0], items[1]): it is sent through CartAPI (source "set", so the cart
 *   drawer opens) after checking that both sizes are chosen; otherwise the message names what is missing
 *   and focus moves to that size group.
 * - Theme editor: selecting a set block shows its tab.
 */
import { CartAPI, announce, config, prefersReducedMotion } from '@theme/core';

const SOURCE = 'set';

class SwSetBuilder extends HTMLElement {
  #busy = false;

  get #tabs() {
    return /** @type {HTMLButtonElement[]} */ ([...this.querySelectorAll('[data-set-tab]')]);
  }

  connectedCallback() {
    this.addEventListener('click', this.#onClick);
    this.addEventListener('keydown', this.#onKeydown);
    this.addEventListener('change', this.#onChange);
    this.addEventListener('submit', this.#onSubmit);
    for (const form of this.querySelectorAll('form[data-set-panel]')) {
      /** @type {HTMLFormElement} */ (form).noValidate = true;
    }
    if (config().designMode) document.addEventListener('shopify:block:select', this.#onBlockSelect);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.#onClick);
    this.removeEventListener('keydown', this.#onKeydown);
    this.removeEventListener('change', this.#onChange);
    this.removeEventListener('submit', this.#onSubmit);
    document.removeEventListener('shopify:block:select', this.#onBlockSelect);
  }

  /**
   * @param {HTMLButtonElement} tab
   * @param {boolean} [focus]
   */
  #select(tab, focus = false) {
    for (const item of this.#tabs) {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls') ?? '')?.toggleAttribute('data-set-hidden', !selected);
    }
    if (focus) tab.focus();
    tab.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }

  /** @param {MouseEvent} event */
  #onClick = (event) => {
    const tab = /** @type {Element} */ (event.target).closest('[data-set-tab]');
    if (tab instanceof HTMLButtonElement) this.#select(tab);
  };

  /** @param {KeyboardEvent} event */
  #onKeydown = (event) => {
    const tab = /** @type {Element} */ (event.target).closest('[data-set-tab]');
    if (!(tab instanceof HTMLButtonElement)) return;
    const tabs = this.#tabs;
    const index = tabs.indexOf(tab);
    const step = getComputedStyle(this).direction === 'rtl' ? -1 : 1;
    let next;
    switch (event.key) {
      case 'ArrowRight':
        next = index + step;
        break;
      case 'ArrowLeft':
        next = index - step;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.#select(tabs[(next + tabs.length) % tabs.length], true);
  };

  /** @param {Event} event */
  #onChange = (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'radio' || !input.form) return;
    const form = input.form;
    const item = input.closest('[data-set-item]');
    if (!(item instanceof HTMLElement)) return;

    // The shorts' own choice replaces the picked size: the note no longer applies.
    if (item.dataset.setItem === '1') {
      const note = /** @type {HTMLElement | null} */ (item.querySelector('[data-set-note]'));
      if (note) note.hidden = true;
    }

    if (item.dataset.setItem === '0') this.#matchShorts(form, input);
    if (this.#missing(form).length === 0) this.#showError(form, '');
  };

  /**
   * Picks the jersey's size for the shorts while they have none.
   * @param {HTMLFormElement} form
   * @param {HTMLInputElement} jerseySize
   */
  #matchShorts(form, jerseySize) {
    const shorts = form.querySelector('[data-set-item="1"]');
    if (!shorts || shorts.querySelector('input[type="radio"]:checked')) return;
    const match = /** @type {HTMLInputElement[]} */ ([...shorts.querySelectorAll('input[type="radio"]')]).find(
      (radio) => radio.dataset.size === jerseySize.dataset.size && !radio.disabled,
    );
    if (!match) return;
    match.checked = true;
    const note = /** @type {HTMLElement | null} */ (shorts.querySelector('[data-set-note]'));
    if (!note) return;
    note.textContent = (note.dataset.template ?? '').replace('[size]', match.dataset.size ?? '');
    note.hidden = false;
    announce(note.textContent);
  }

  /**
   * The set items that have no size chosen.
   * @param {HTMLFormElement} form
   * @returns {HTMLElement[]}
   */
  #missing(form) {
    return /** @type {HTMLElement[]} */ ([...form.querySelectorAll('[data-set-item]')]).filter(
      (item) => !item.querySelector('input[type="radio"]:checked'),
    );
  }

  /**
   * @param {HTMLFormElement} form
   * @param {string} message
   */
  #showError(form, message) {
    const error = /** @type {HTMLElement | null} */ (form.querySelector('[data-set-error]'));
    if (error) error.textContent = message;
  }

  /** @param {SubmitEvent} event */
  #onSubmit = async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('[data-set-panel]')) return;
    event.preventDefault();
    const button = form.querySelector('[data-set-add]');
    if (this.#busy || !(button instanceof HTMLButtonElement)) return;

    const missing = this.#missing(form);
    if (missing.length > 0) {
      const error = /** @type {HTMLElement | null} */ (form.querySelector('[data-set-error]'));
      let message = error?.dataset.bothMessage ?? '';
      if (missing.length === 1) {
        message =
          (missing[0].dataset.setItem === '0' ? error?.dataset.jerseyMessage : error?.dataset.shortsMessage) ?? '';
      }
      this.#showError(form, message);
      /** @type {HTMLInputElement | null} */ (missing[0].querySelector('input[type="radio"]:not(:disabled)'))?.focus();
      return;
    }

    this.#showError(form, '');
    this.#setBusy(button, true);
    try {
      await CartAPI.add(new FormData(form), { sections: ['cart-drawer'], source: SOURCE });
      const { cartType, routes, strings } = config();
      if (cartType === 'page') {
        window.location.assign(routes.cart_url);
        return;
      }
      announce(form.dataset.addedMessage || strings.addedToCart || '');
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : config().strings.cartError;
      this.#showError(form, message ?? '');
    } finally {
      this.#setBusy(button, false);
    }
  };

  /**
   * @param {HTMLButtonElement} button
   * @param {boolean} busy
   */
  #setBusy(button, busy) {
    this.#busy = busy;
    button.classList.toggle('is-loading', busy);
    if (busy) {
      button.setAttribute('aria-busy', 'true');
    } else {
      button.removeAttribute('aria-busy');
    }
  }

  /** @param {Event} event */
  #onBlockSelect = (event) => {
    const blockId = /** @type {CustomEvent} */ (event).detail?.blockId;
    const tab = this.#tabs.find((item) => item.getAttribute('aria-controls') === `SetPanel-${blockId}`);
    if (tab) this.#select(tab);
  };
}

if (!customElements.get('sw-set-builder')) customElements.define('sw-set-builder', SwSetBuilder);
