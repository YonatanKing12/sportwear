/**
 * SportWear product page: variant selection and add to cart.
 *
 * <sw-product-info> (sections/main-product.liquid) wraps the product info column. When a size (or any
 * option value) changes, it re-renders the variant-dependent parts of the section through the Section
 * Rendering API: every element marked [data-product-dynamic] (price, add to cart button, stock note,
 * express checkout visibility, "complete the set" notes, and the option picker of multi-option
 * products). It keeps ?variant= in the URL and publishes EVENTS.variantChanged. Prices and
 * availability always come from Liquid; nothing here recomputes them.
 *
 * <sw-product-form> wraps a product form (the main buy buttons and each "complete the set" row) and
 * adds it to the cart through CartAPI, with a loading state and inline errors. Without JavaScript
 * the forms post to the cart normally.
 */
import { CartAPI, EVENTS, announce, config, parseHTML, publish } from '@theme/core';

class SwProductInfo extends HTMLElement {
  /** @type {AbortController | null} */
  #controller = null;

  connectedCallback() {
    this.addEventListener('change', this.#onChange);
    this.#adoptVariantInput();
  }

  disconnectedCallback() {
    this.removeEventListener('change', this.#onChange);
    this.#controller?.abort();
  }

  /** The hidden variant id input of the main product form. */
  get #idInput() {
    return /** @type {HTMLInputElement | null} */ (this.querySelector('input[data-variant-id-input]'));
  }

  /**
   * Without JavaScript the size radios post the variant id themselves (form="…"). From now on the
   * hidden input inside the form carries it, where express checkout buttons and apps look for it.
   */
  #adoptVariantInput() {
    const input = this.#idInput;
    if (!input?.disabled) return;
    const radios = /** @type {NodeListOf<HTMLInputElement>} */ (
      this.querySelectorAll('input[data-variant-option][form]')
    );
    for (const radio of radios) {
      if (radio.checked && radio.dataset.variantId) input.value = radio.dataset.variantId;
      radio.removeAttribute('form');
      radio.name = `${this.dataset.sectionId}-variant`;
    }
    input.disabled = false;
  }

  /** @param {Event} event */
  #onChange = (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.hasAttribute('data-variant-option')) return;
    const variantId = input.dataset.variantId ?? '';
    const idInput = this.#idInput;
    // Keep the form in step at once, so an immediate "add to cart" adds the size just chosen (and
    // never the previous one while an unknown option combination is still being looked up).
    if (idInput) idInput.value = variantId;
    this.#render(variantId);
  };

  /** @returns {string[]} ids of the checked option values, for option combinations without a known variant */
  #selectedOptionValueIds() {
    return [...this.querySelectorAll('input[data-variant-option]:checked')].map(
      (input) => input.getAttribute('data-option-value-id') ?? '',
    );
  }

  /** @param {string} variantId - empty when the chosen option combination has no variant id yet */
  async #render(variantId) {
    const url = new URL(this.dataset.productUrl || window.location.pathname, window.location.origin);
    if (variantId) {
      url.searchParams.set('variant', variantId);
    } else {
      url.searchParams.set('option_values', this.#selectedOptionValueIds().join(','));
    }
    url.searchParams.set('section_id', this.dataset.sectionId ?? '');

    this.#controller?.abort();
    const controller = new AbortController();
    this.#controller = controller;
    this.setAttribute('aria-busy', 'true');

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Section request failed (${response.status})`);
      const next = parseHTML(await response.text()).querySelector('sw-product-info');
      if (!next) throw new Error('The product section came back without product info');
      this.#apply(next);
    } catch {
      if (controller.signal.aborted) return;
      // Never leave a stale price or button on screen: load the page for this choice instead.
      url.searchParams.delete('section_id');
      window.location.assign(url);
    } finally {
      if (this.#controller === controller) {
        this.#controller = null;
        this.removeAttribute('aria-busy');
      }
    }
  }

  /** @param {Element} next - the freshly rendered <sw-product-info> */
  #apply(next) {
    for (const target of this.querySelectorAll('[data-product-dynamic]')) {
      const key = target.getAttribute('data-product-dynamic') ?? '';
      const source = next.querySelector(`[data-product-dynamic="${CSS.escape(key)}"]`);
      if (!source) continue;
      if (target.hasAttribute('data-dynamic-attrs')) {
        target.toggleAttribute('hidden', source.hasAttribute('hidden'));
        continue;
      }
      const active = document.activeElement;
      const focusId = active instanceof HTMLElement && target.contains(active) ? active.id : '';
      target.replaceChildren(...source.childNodes);
      if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
    }

    const variantId = next.getAttribute('data-variant-id') ?? '';
    const available = next.getAttribute('data-variant-available') === 'true';
    const mediaId = next.getAttribute('data-variant-media-id') ?? '';
    this.dataset.variantId = variantId;
    this.dataset.variantAvailable = String(available);
    this.dataset.variantMediaId = mediaId;

    const idInput = this.#idInput;
    if (idInput && variantId) idInput.value = variantId;

    if (variantId) {
      const page = new URL(window.location.href);
      page.searchParams.set('variant', variantId);
      page.searchParams.delete('option_values');
      window.history.replaceState(window.history.state, '', page);
    }

    publish(EVENTS.variantChanged, {
      sectionId: this.dataset.sectionId,
      variant: variantId ? { id: Number(variantId), available, mediaId: mediaId ? Number(mediaId) : null } : null,
    });
  }
}

class SwProductForm extends HTMLElement {
  #busy = false;

  get #form() {
    return this.querySelector('form');
  }

  get #error() {
    return /** @type {HTMLElement | null} */ (this.querySelector('[data-form-error]'));
  }

  connectedCallback() {
    const form = this.#form;
    if (!form) return;
    // Validation messages are shown inline (see #onSubmit); without JavaScript the browser validates.
    form.noValidate = true;
    form.addEventListener('submit', this.#onSubmit);
    this.addEventListener('click', this.#onStep);
    this.addEventListener('change', this.#onFieldChange);
  }

  disconnectedCallback() {
    this.#form?.removeEventListener('submit', this.#onSubmit);
    this.removeEventListener('click', this.#onStep);
    this.removeEventListener('change', this.#onFieldChange);
  }

  /** Quantity stepper buttons ([data-quantity-step="-1" | "1"]). @param {MouseEvent} event */
  #onStep = (event) => {
    const button = event.target instanceof Element ? event.target.closest('[data-quantity-step]') : null;
    if (!(button instanceof HTMLElement) || !this.contains(button)) return;
    const input = this.querySelector('input[name="quantity"]');
    if (!(input instanceof HTMLInputElement)) return;
    const step = Number(input.step) || 1;
    const min = Number(input.min) || 1;
    const max = input.max ? Number(input.max) : Number.POSITIVE_INFINITY;
    const current = Number(input.value) || min;
    const next = current + Number(button.dataset.quantityStep) * step;
    input.value = String(Math.min(max, Math.max(min, next)));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  /** @param {Event} event */
  #onFieldChange = (event) => {
    const field = event.target;
    if (!(field instanceof HTMLElement) || field.getAttribute('aria-invalid') !== 'true') return;
    field.removeAttribute('aria-invalid');
    this.#showError('');
  };

  /** @param {SubmitEvent} event */
  #onSubmit = async (event) => {
    event.preventDefault();
    const form = /** @type {HTMLFormElement} */ (event.currentTarget);
    const button = form.querySelector('[type="submit"]');
    if (this.#busy || !(button instanceof HTMLButtonElement) || button.disabled) return;

    const invalid = [...form.elements].find(
      (field) =>
        (field instanceof HTMLSelectElement || field instanceof HTMLInputElement) &&
        field.willValidate &&
        !field.checkValidity(),
    );
    if (invalid instanceof HTMLElement) {
      invalid.setAttribute('aria-invalid', 'true');
      const message =
        this.#error?.dataset.invalidMessage || /** @type {HTMLInputElement} */ (invalid).validationMessage;
      this.#showError(message);
      invalid.focus();
      return;
    }

    const formData = new FormData(form);
    // No variant yet (an option combination is still being looked up): the button is about to update.
    if (!formData.get('id')) return;

    this.#showError('');
    this.#setBusy(button, true);
    try {
      await CartAPI.add(formData, {
        sections: ['cart-drawer'],
        source: this.dataset.source || 'product-form',
      });
      const { cartType, routes, strings } = config();
      if (cartType === 'page') {
        window.location.assign(routes.cart_url);
        return;
      }
      announce(strings.addedToCart ?? '');
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : config().strings.cartError;
      this.#showError(message ?? '');
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

  /** @param {string} message */
  #showError(message) {
    const error = this.#error;
    if (error) error.textContent = message;
  }
}

if (!customElements.get('sw-product-info')) customElements.define('sw-product-info', SwProductInfo);
if (!customElements.get('sw-product-form')) customElements.define('sw-product-form', SwProductForm);

/* Theme editor: open a collapsible block when it is selected, and close the product dialogs (size
   guide, zoom) so they never cover the block being edited. */
if (config().designMode) {
  document.addEventListener('shopify:block:select', (event) => {
    const block = event.target;
    if (!(block instanceof HTMLElement) || !block.closest('sw-product-info')) return;
    for (const dialog of document.querySelectorAll('.main-product dialog[open]')) {
      if (dialog instanceof HTMLDialogElement) dialog.close();
    }
    if (block instanceof HTMLDetailsElement && block.hasAttribute('data-product-accordion') && !block.open) {
      block.open = true;
      block.dataset.openedByEditor = 'true';
    }
  });

  document.addEventListener('shopify:block:deselect', (event) => {
    const block = event.target;
    if (!(block instanceof HTMLDetailsElement) || block.dataset.openedByEditor !== 'true') return;
    block.open = false;
    delete block.dataset.openedByEditor;
  });
}
