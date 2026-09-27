/**
 * SportWear product page: size choice, variant selection, add to cart and the sticky buy bar.
 *
 * <sw-product-info> (sections/main-product.liquid) wraps the product info column and owns the variant
 * state. When a size (or any option value) changes, it re-renders the variant-dependent parts of the
 * section through the Section Rendering API: every element marked [data-product-dynamic] (prices, add
 * to cart buttons, stock note, express checkout visibility, "complete the set" notes, the sticky bar's
 * buttons and the option picker of multi-option products). It keeps ?variant= in the URL and publishes
 * EVENTS.variantChanged. Prices and availability always come from Liquid; nothing here recomputes them.
 *
 * The size is a conscious choice. When more than one size is in stock and the URL names none, the
 * section renders [data-size-required]: the size preselected for the no-JavaScript form is cleared,
 * the buttons read "Choose a size", and pressing the main one shows a message at the size picker and
 * moves focus there. The same size can be chosen in three places, all kept in step: the main picker,
 * the size sheet (phones) and the sticky bar's own size buttons (desktop).
 *
 * <sw-product-form> wraps a product form (the main buy buttons and each "complete the set" row) and
 * adds it to the cart through CartAPI, with a loading state on the pressed button and inline errors.
 * The sticky bar's and the sheet's add buttons submit the main form from outside it (form="…").
 * Without JavaScript the forms post to the cart normally.
 *
 * <sw-sticky-buy> is the bar that slides up once the main buy buttons (phones) or the whole product
 * section (desktop, where the info column is sticky) have scrolled out of view above the screen, and
 * slides away when the main buy buttons are back in view. While hidden it is inert.
 */
import { CartAPI, EVENTS, announce, config, parseHTML, prefersReducedMotion, publish, subscribe } from '@theme/core';

/** Same breakpoint as the CSS: from here up the sticky bar shows the sizes itself. */
const DESKTOP = window.matchMedia('(min-width: 990px)');

/** <sw-product-form> → <sw-product-info>: the form has no variant to add yet (no size chosen). */
const FORM_INCOMPLETE = 'sw:product-form:incomplete';
/** <sw-product-form> → <sw-product-info>: added to the cart. Cancel it to announce your own message. */
const FORM_ADDED = 'sw:product-form:added';

/** @param {Element} element */
const isShown = (element) => element.getClientRects().length > 0;

class SwProductInfo extends HTMLElement {
  /** @type {AbortController | null} */
  #controller = null;
  /** @type {Array<() => void>} */
  #subscriptions = [];

  connectedCallback() {
    this.addEventListener('change', this.#onChange);
    this.addEventListener('click', this.#onClick);
    this.addEventListener(FORM_INCOMPLETE, this.#onFormIncomplete);
    this.addEventListener(FORM_ADDED, this.#onFormAdded);
    this.#subscriptions = [
      subscribe(EVENTS.drawerOpen, this.#onDrawerOpen),
      subscribe(EVENTS.drawerClose, this.#onDrawerClose),
      subscribe(EVENTS.cartUpdated, this.#onCartUpdated),
    ];
    this.#adoptVariantInput();
  }

  disconnectedCallback() {
    this.removeEventListener('change', this.#onChange);
    this.removeEventListener('click', this.#onClick);
    this.removeEventListener(FORM_INCOMPLETE, this.#onFormIncomplete);
    this.removeEventListener(FORM_ADDED, this.#onFormAdded);
    for (const unsubscribe of this.#subscriptions) unsubscribe();
    this.#subscriptions = [];
    this.#controller?.abort();
  }

  /** The hidden variant id input of the main product form. */
  get #idInput() {
    return /** @type {HTMLInputElement | null} */ (this.querySelector('input[data-variant-id-input]'));
  }

  /** The <sw-product-form> of the main buy buttons (not the "complete the set" rows). */
  get #mainForm() {
    return this.querySelector('sw-product-form[data-source="product-form"]');
  }

  /** The size sheet's <sw-drawer>. */
  get #sheet() {
    return /** @type {HTMLElement | null} */ (this.querySelector('[data-size-sheet]'));
  }

  get #sizeRequired() {
    return this.hasAttribute('data-size-required');
  }

  /**
   * Without JavaScript the size radios post the variant id themselves (form="…"). From now on the
   * hidden input inside the form carries it, where express checkout buttons and apps look for it.
   * When the size has to be chosen, the size preselected for the no-JavaScript form is cleared.
   */
  #adoptVariantInput() {
    const input = this.#idInput;
    if (!input?.disabled) return;
    const sizeRequired = this.#sizeRequired;
    const radios = /** @type {NodeListOf<HTMLInputElement>} */ (
      this.querySelectorAll('input[data-variant-option][form]')
    );
    for (const radio of radios) {
      if (sizeRequired) radio.checked = false;
      else if (radio.checked && radio.dataset.variantId) input.value = radio.dataset.variantId;
      radio.removeAttribute('form');
      radio.name = `${this.dataset.sectionId}-variant`;
    }
    if (sizeRequired) input.value = '';
    input.disabled = false;
  }

  /** @param {Event} event */
  #onChange = (event) => {
    const input = event.target;
    if (input instanceof HTMLSelectElement && input.hasAttribute('data-set-size')) {
      // A size the customer chose in a "complete the set" row is theirs: the main size no longer moves it.
      input.dataset.setSize = 'chosen';
      return;
    }
    if (!(input instanceof HTMLInputElement) || !input.hasAttribute('data-variant-option')) return;
    const variantId = input.dataset.variantId ?? '';
    if (input.hasAttribute('data-size-input')) this.#chooseSize(input);
    // Keep the form in step at once, so an immediate "add to cart" adds the size just chosen (and
    // never the previous one while an unknown option combination is still being looked up).
    const idInput = this.#idInput;
    if (idInput) idInput.value = variantId;
    this.#render(variantId);
  };

  /**
   * A size was chosen in the main picker, the size sheet or the bar: check it in the other two, leave
   * the "choose a size" state, and show it on the bar's size chip at once (the prices and buttons
   * follow with the re-rendered section).
   * @param {HTMLInputElement} input
   */
  #chooseSize(input) {
    const variantId = input.dataset.variantId;
    for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (this.querySelectorAll('input[data-size-input]'))) {
      if (radio !== input) radio.checked = radio.dataset.variantId === variantId;
    }
    for (const label of this.querySelectorAll('[data-selected-size]')) label.textContent = input.dataset.sizeName ?? '';
    this.#matchSetSizes(input.dataset.sizeName ?? '');
    this.clearSizePrompt();
    if (!this.#sizeRequired) return;
    this.removeAttribute('data-size-required');
    for (const button of /** @type {NodeListOf<HTMLButtonElement>} */ (
      this.querySelectorAll('button[data-size-pending]')
    )) {
      button.disabled = false;
      button.removeAttribute('data-size-pending');
    }
  }

  /**
   * The size chosen for this product is picked in the "complete the set" rows too (a jersey and its
   * shorts are mostly bought in the same size), unless the customer chose that row's size themselves.
   * A row that does not sell the size in stock goes back to "Choose a size".
   * @param {string} size
   */
  #matchSetSizes(size) {
    for (const select of /** @type {NodeListOf<HTMLSelectElement>} */ (
      this.querySelectorAll('select[data-set-size]')
    )) {
      if (select.dataset.setSize === 'chosen') continue;
      const match = [...select.options].find(
        (option) => !option.disabled && option.value && option.dataset.size === size,
      );
      select.value = match?.value ?? '';
    }
  }

  /** The sticky bar's "Choose a size" on desktop points to the bar's own size buttons. @param {MouseEvent} event */
  #onClick = (event) => {
    const prompt = event.target instanceof Element ? event.target.closest('[data-size-prompt]') : null;
    if (!prompt || !this.contains(prompt)) return;
    const picker = /** @type {HTMLElement | null} */ (this.querySelector('[data-size-picker="bar"]'));
    if (picker) this.#promptForSize(picker);
  };

  /** "Add to cart" pressed with no size chosen: ask for one at the size picker. @param {Event} event */
  #onFormIncomplete = (event) => {
    if (!this.#sizeRequired || event.target !== this.#mainForm) return;
    const picker = /** @type {HTMLElement | null} */ (this.querySelector('[data-size-picker="main"]'));
    if (picker) this.#promptForSize(picker, { scroll: true });
  };

  /**
   * Shows the picker's "choose a size" message, ties it to the size buttons for screen readers and
   * moves focus to the first size in stock.
   * @param {HTMLElement} picker - a [data-size-picker]
   * @param {{ scroll?: boolean }} [options]
   */
  #promptForSize(picker, { scroll = false } = {}) {
    const message = picker.querySelector('[data-size-message]');
    const radios = /** @type {HTMLInputElement[]} */ ([...picker.querySelectorAll('input[data-size-input]')]);
    picker.setAttribute('data-invalid', '');
    if (message instanceof HTMLElement) {
      message.hidden = false;
      for (const radio of radios) {
        radio.setAttribute('aria-describedby', message.id);
        radio.setAttribute('aria-invalid', 'true');
      }
    }
    radios.find((radio) => !radio.disabled)?.focus({ preventScroll: true });
    if (scroll) picker.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  /**
   * Hides the "choose a size" messages (after a choice, or when the sticky bar hides).
   * @param {ParentNode} [scope] - only the pickers inside this element
   */
  clearSizePrompt(scope = this) {
    for (const picker of scope.querySelectorAll('[data-size-picker][data-invalid]')) {
      picker.removeAttribute('data-invalid');
      const message = picker.querySelector('[data-size-message]');
      if (message instanceof HTMLElement) message.hidden = true;
      for (const radio of picker.querySelectorAll('input[data-size-input]')) {
        radio.removeAttribute('aria-describedby');
        radio.removeAttribute('aria-invalid');
      }
    }
  }

  /** The size sheet opened: focus the chosen size, or the first one in stock. @param {{ id: string }} detail */
  #onDrawerOpen = ({ id }) => {
    const sheet = this.#sheet;
    if (!sheet || id !== sheet.id) return;
    const radios = /** @type {HTMLInputElement[]} */ ([...sheet.querySelectorAll('input[data-size-input]')]);
    const target = radios.find((radio) => radio.checked && !radio.disabled) ?? radios.find((radio) => !radio.disabled);
    target?.focus({ preventScroll: true });
  };

  /** @param {{ id: string }} detail */
  #onDrawerClose = ({ id }) => {
    if (id === this.#sheet?.id) this.#refocusBar();
  };

  /**
   * Focus returns to the bar button that opened the size sheet (<sw-drawer> does that). When that
   * button is gone meanwhile ("Choose a size" becomes the size chip once a size is chosen, and the bar
   * is re-rendered with the variant), focus goes to the bar button that took its place.
   */
  #refocusBar() {
    // Focus is lost when it is on the page body, or still on a control of the closed sheet (the
    // browser moves it to the body a moment later).
    const active = document.activeElement;
    const lost = !(active instanceof HTMLElement) || active === document.body || !isShown(active);
    if (!lost && !this.#sheet?.contains(active)) return;
    const buttons = this.querySelectorAll('.product-sticky__size, .product-sticky__choose, .product-sticky__add');
    const target = [...buttons].find((button) => button instanceof HTMLElement && isShown(button));
    if (target instanceof HTMLElement) target.focus({ preventScroll: true });
  }

  /**
   * Added to the cart from the size sheet: close the sheet now, before the cart drawer opens (the cart
   * drawer opens itself on this event, after rendering).
   * @param {{ source?: string }} detail
   */
  #onCartUpdated = ({ source }) => {
    if (source !== 'product-form') return;
    const dialog = this.#sheet?.querySelector('dialog');
    if (!dialog?.open) return;
    dialog.close();
    this.#refocusBar();
  };

  /** Announces what was added ("Added to cart: …, size M") instead of the generic message. @param {Event} event */
  #onFormAdded = (event) => {
    if (event.target !== this.#mainForm) return;
    event.preventDefault();
    announce(this.#addedMessage());
  };

  #addedMessage() {
    const chosen = /** @type {HTMLInputElement | null} */ (this.querySelector('input[data-size-input]:checked'));
    const size = chosen?.dataset.sizeName ?? '';
    const withSize = this.dataset.addedSizeMessage;
    if (size && withSize) return withSize.replace('[size]', () => size);
    return this.dataset.addedMessage || config().strings.addedToCart || '';
  }

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
      const hadFocus = active instanceof HTMLElement && target.contains(active);
      // A button that is adding to the cart right now keeps its spinner in the new markup.
      const busyIds = [...target.querySelectorAll('[aria-busy="true"][id]')].map((element) => element.id);
      target.replaceChildren(...source.childNodes);
      for (const id of busyIds) {
        const button = document.getElementById(id);
        button?.classList.add('is-loading');
        button?.setAttribute('aria-busy', 'true');
      }
      if (hadFocus) {
        const same = active.id ? document.getElementById(active.id) : null;
        const controls = target.querySelectorAll('button:not([disabled]), [href], input:not([disabled])');
        const replacement = same && isShown(same) ? same : [...controls].find(isShown);
        if (replacement instanceof HTMLElement) replacement.focus({ preventScroll: true });
      }
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
    // The pressed button: the form's own, or one outside it (form="…") like the sticky bar's.
    const button =
      event.submitter instanceof HTMLButtonElement ? event.submitter : form.querySelector('[type="submit"]');
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
    if (!formData.get('id')) {
      // No size chosen yet (<sw-product-info> asks for one), or an option combination is still being
      // looked up (the button is about to update).
      this.dispatchEvent(new CustomEvent(FORM_INCOMPLETE, { bubbles: true, detail: { submitter: button } }));
      return;
    }

    this.#showError('', button);
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
      const added = new CustomEvent(FORM_ADDED, { bubbles: true, cancelable: true, detail: { submitter: button } });
      if (this.dispatchEvent(added)) announce(strings.addedToCart ?? '');
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : config().strings.cartError;
      this.#showError(message ?? '', button);
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
    // The section may have re-rendered the button meanwhile: update the one on the page.
    const target = button.isConnected || !button.id ? button : (document.getElementById(button.id) ?? button);
    target.classList.toggle('is-loading', busy);
    if (busy) {
      target.setAttribute('aria-busy', 'true');
    } else {
      target.removeAttribute('aria-busy');
    }
  }

  /**
   * The error line of the pressed button (the one its aria-describedby names, like the sticky bar's
   * bubble), else the form's own.
   * @param {HTMLButtonElement} [button]
   */
  #errorFor(button) {
    const id = button?.getAttribute('aria-describedby');
    const element = id ? document.getElementById(id) : null;
    return element?.hasAttribute('data-form-error') ? element : this.#error;
  }

  /**
   * @param {string} message
   * @param {HTMLButtonElement} [button]
   */
  #showError(message, button) {
    const error = this.#errorFor(button);
    if (error) error.textContent = message;
  }
}

class SwStickyBuy extends HTMLElement {
  /** @type {IntersectionObserver | null} */
  #observer = null;
  /** @type {ResizeObserver | null} */
  #resizeObserver = null;
  #frame = 0;

  connectedCallback() {
    DESKTOP.addEventListener('change', this.#observe);
    this.#observe();
  }

  disconnectedCallback() {
    DESKTOP.removeEventListener('change', this.#observe);
    this.#stop();
  }

  get #buyButtons() {
    return this.closest('sw-product-info')?.querySelector('.product-info__block--buy-buttons') ?? null;
  }

  /**
   * The bar shows once the main buy buttons have scrolled above the screen. On desktop the info column
   * is sticky and keeps those buttons in view while the product section is on screen, so there the bar
   * waits for the whole section to scroll away (or for the end of a page too short for that).
   */
  #observe = () => {
    this.#stop();
    const layout = this.closest('.main-product__layout');
    if (DESKTOP.matches && layout?.classList.contains('main-product__layout--sticky')) {
      window.addEventListener('scroll', this.#onScroll, { passive: true });
      window.addEventListener('resize', this.#onScroll, { passive: true });
      // Also when the page grows or shrinks without scrolling (a re-rendered variant, loaded recommendations).
      this.#resizeObserver = new ResizeObserver(this.#onScroll);
      this.#resizeObserver.observe(document.body);
      this.#onScroll();
      return;
    }
    const target = this.#buyButtons;
    if (!target) return;
    // The observed area runs from the top of the screen to far below it, so the only change that
    // counts is the target passing above the screen's top edge; a fast fling or a jump from below the
    // screen to above it (never intersecting the screen itself) still flips the state.
    this.#observer = new IntersectionObserver(
      ([entry]) => this.#toggle(!entry.isIntersecting && entry.boundingClientRect.bottom < 0),
      { rootMargin: '0px 0px 100000px 0px' },
    );
    this.#observer.observe(target);
  };

  /**
   * Desktop check, at most once per frame (an observer cannot tell that the page end is reached). Once
   * shown, the bar stays until the main buy buttons are back in view, so it never slides away while
   * it is being used (choosing a size makes the page taller).
   */
  #onScroll = () => {
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(() => {
      const layout = this.closest('.main-product__layout');
      const buttons = this.#buyButtons;
      if (!layout || !buttons) return;
      const buttonsGone = buttons.getBoundingClientRect().bottom < 0;
      if (this.hasAttribute('data-visible')) {
        this.#toggle(buttonsGone);
        return;
      }
      const root = document.documentElement;
      const atEnd = window.scrollY + window.innerHeight >= root.scrollHeight - 2;
      const sectionGone = layout.getBoundingClientRect().bottom <= 0;
      this.#toggle(sectionGone || (atEnd && buttonsGone));
    });
  };

  #stop() {
    this.#observer?.disconnect();
    this.#observer = null;
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    window.removeEventListener('scroll', this.#onScroll);
    window.removeEventListener('resize', this.#onScroll);
    cancelAnimationFrame(this.#frame);
  }

  /** @param {boolean} visible */
  #toggle(visible) {
    if (visible === this.hasAttribute('data-visible')) return;
    this.toggleAttribute('data-visible', visible);
    this.inert = !visible;
    if (visible) return;
    // Messages from the bar go with it.
    const info = /** @type {SwProductInfo | null} */ (this.closest('sw-product-info'));
    info?.clearSizePrompt(this);
    const error = this.querySelector('[data-form-error]');
    if (error) error.textContent = '';
  }
}

if (!customElements.get('sw-product-info')) customElements.define('sw-product-info', SwProductInfo);
if (!customElements.get('sw-product-form')) customElements.define('sw-product-form', SwProductForm);
if (!customElements.get('sw-sticky-buy')) customElements.define('sw-sticky-buy', SwStickyBuy);

/* Theme editor: open a collapsible block when it is selected, and close the product dialogs (size
   guide, size sheet, zoom) so they never cover the block being edited. */
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
