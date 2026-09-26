/**
 * SportWear header components. ES module loaded by sections/header.liquid and, when it has more than
 * one message, sections/announcement-bar.liquid (the browser runs it once).
 *
 *   <sw-header>            sticky behaviour, --header-height, desktop dropdowns, menu drawer extras
 *   <sw-announcement-bar>  calm carousel for two to five announcements
 */
import { EVENTS, closeDrawer, prefersReducedMotion, subscribe } from '@theme/core';

/** Scroll distance (px) that counts as a deliberate scroll up or down. */
const SCROLL_THRESHOLD = 8;

/* ---------------------------------------------------------------------------------------------
 * <sw-header data-sticky="none|always|scroll-up">
 *
 * --header-height (on <html>) is the space the header covers at the top of the viewport: its height
 * while it is sticky and shown, 0px when it scrolls away with the page (sticky "none") or is hidden
 * while scrolling down ("scroll-up"). Sticky elements and anchors offset with
 * `top: var(--header-height, 0px)` (base.css already uses it for scroll-padding).
 *
 * "scroll-up": the header hides while the visitor scrolls down and comes back when they scroll up,
 * when focus moves into it, or near the top of the page. It never hides while a dropdown is open
 * or keyboard focus is inside it.
 *
 * Dropdowns (<details> in the header bar, including the language switcher): one open at a time,
 * Escape closes and returns focus to the toggle, a click outside or focus leaving closes.
 * ------------------------------------------------------------------------------------------- */
class SwHeader extends HTMLElement {
  /** @type {AbortController | null} */
  #abort = null;
  /** @type {ResizeObserver | null} */
  #resizeObserver = null;
  /** @type {HTMLElement | null} the <header> bar */
  #bar = null;
  /** @type {HTMLElement} the element that sticks: the section wrapper */
  #stickyElement = this;
  #height = 0;
  #hidden = false;
  #lastScrollY = 0;
  #naturalTop = 0;
  #frame = 0;

  get #mode() {
    return this.dataset.sticky ?? 'none';
  }

  connectedCallback() {
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    this.#bar = this.querySelector('.header');
    this.#stickyElement = /** @type {HTMLElement} */ (this.closest('.header-section') ?? this);

    if (this.#bar) {
      this.#resizeObserver = new ResizeObserver(() => this.#measure());
      this.#resizeObserver.observe(this.#bar);
      this.#measure();

      this.#bar.addEventListener('toggle', this.#onToggle, { capture: true, signal });
      this.#bar.addEventListener('focusout', this.#onFocusOut, { signal });
    }

    if (this.#mode === 'scroll-up') {
      this.#lastScrollY = window.scrollY;
      this.#updateNaturalTop();
      window.addEventListener('scroll', this.#onScroll, { passive: true, signal });
      this.addEventListener('focusin', () => this.#setHidden(false), { signal });
    }

    document.addEventListener('keydown', this.#onKeydown, { signal });
    document.addEventListener('click', this.#onDocumentClick, { signal });
    this.querySelector('#MenuDrawer')?.addEventListener('click', this.#onMenuDrawerClick, { signal });

    const unsubscribe = subscribe(EVENTS.drawerOpen, ({ id }) => {
      this.#closeDropdowns();
      if (id === 'SearchModal') {
        /** @type {HTMLInputElement | null} */ (this.querySelector('#SearchModalInput'))?.select();
      }
    });
    signal.addEventListener('abort', unsubscribe);

    // Theme editor: bring the header back into view when its section is selected.
    document.addEventListener(
      'shopify:section:select',
      (event) => {
        if (event.target instanceof Node && event.target.contains(this)) this.#setHidden(false);
      },
      { signal },
    );
  }

  disconnectedCallback() {
    this.#abort?.abort();
    this.#resizeObserver?.disconnect();
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    this.#stickyElement.removeAttribute('data-header-hidden');
    document.documentElement.style.removeProperty('--header-height');
  }

  #measure() {
    if (!this.#bar) return;
    this.#height = Math.round(this.#bar.getBoundingClientRect().height);
    this.#publishHeight();
  }

  #publishHeight() {
    const covered = this.#mode === 'none' || this.#hidden ? 0 : this.#height;
    document.documentElement.style.setProperty('--header-height', `${covered}px`);
  }

  #onScroll = () => {
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.#updateOnScroll();
    });
  };

  #updateOnScroll() {
    const scrollY = Math.max(window.scrollY, 0);
    if (!this.#hidden) this.#updateNaturalTop();

    // Near the top of the page the header is in its normal place: always show it.
    if (scrollY <= this.#naturalTop + this.#height) {
      this.#lastScrollY = scrollY;
      this.#setHidden(false);
      return;
    }

    const delta = scrollY - this.#lastScrollY;
    if (Math.abs(delta) < SCROLL_THRESHOLD) return;
    this.#lastScrollY = scrollY;

    if (delta < 0) {
      this.#setHidden(false);
    } else if (!this.#isBusy()) {
      this.#setHidden(true);
    }
  }

  /** Where the header sits in the page before it sticks (below the announcement bar). */
  #updateNaturalTop() {
    const top = this.#stickyElement.getBoundingClientRect().top;
    if (top > 0) this.#naturalTop = window.scrollY + top;
  }

  /**
   * Keyboard focus inside the bar or an open dropdown keeps the header in place. Focus that only
   * returned to a button after a tap (e.g. closing the menu drawer) does not.
   */
  #isBusy() {
    return Boolean(this.#bar?.querySelector(':focus-visible') || this.#openDropdowns().length);
  }

  /** @param {boolean} hidden */
  #setHidden(hidden) {
    if (this.#mode !== 'scroll-up' || hidden === this.#hidden) return;
    this.#hidden = hidden;
    this.#stickyElement.toggleAttribute('data-header-hidden', hidden);
    this.#publishHeight();
  }

  /** @returns {HTMLDetailsElement[]} */
  #openDropdowns() {
    return this.#bar ? [...this.#bar.querySelectorAll('details[open]')] : [];
  }

  #closeDropdowns() {
    for (const details of this.#openDropdowns()) details.open = false;
  }

  /** @param {Event} event */
  #onToggle = (event) => {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement) || !details.open) return;
    for (const other of this.#openDropdowns()) {
      if (other !== details && !other.contains(details)) other.open = false;
    }
  };

  /** @param {KeyboardEvent} event */
  #onKeydown = (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const focused = document.activeElement;
    for (const details of this.#openDropdowns()) {
      details.open = false;
      if (focused && details.contains(focused)) {
        /** @type {HTMLElement | null} */ (details.querySelector(':scope > summary'))?.focus();
      }
    }
  };

  /** @param {MouseEvent} event */
  #onDocumentClick = (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    for (const details of this.#openDropdowns()) {
      if (!details.contains(target)) details.open = false;
    }
  };

  /**
   * Closes a dropdown when keyboard focus moves somewhere outside it. A null relatedTarget (focus
   * left the window, or a click on a non-focusable spot) is left to the click handler.
   * @param {FocusEvent} event
   */
  #onFocusOut = (event) => {
    const next = event.relatedTarget;
    if (!(next instanceof Node)) return;
    for (const details of this.#openDropdowns()) {
      if (!details.contains(next)) details.open = false;
    }
  };

  /**
   * In-page links (e.g. "#size-guide") close the menu drawer so the target is visible.
   * @param {MouseEvent} event
   */
  #onMenuDrawerClick = (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!(link instanceof HTMLAnchorElement) || !link.hash) return;
    const { pathname, search } = window.location;
    if (link.pathname === pathname && link.search === search) closeDrawer('MenuDrawer');
  };
}

/* ---------------------------------------------------------------------------------------------
 * <sw-announcement-bar data-autoplay="true|false" data-interval="5">
 *
 * Shows one message at a time. Rotation (every data-interval seconds, 5 at least) pauses while the
 * mouse is over the bar, while focus is inside it, while the tab is hidden and while a message is
 * selected in the theme editor. The pause button stops it for good; it never starts on its own for
 * visitors who prefer reduced motion. The slides container is aria-live="off" while rotating and
 * "polite" otherwise, so messages the visitor moves to with previous / next are read out.
 * ------------------------------------------------------------------------------------------- */
class SwAnnouncementBar extends HTMLElement {
  /** @type {AbortController | null} */
  #abort = null;
  /** @type {HTMLElement[]} */
  #slides = [];
  /** @type {HTMLElement | null} */
  #region = null;
  /** @type {HTMLButtonElement | null} */
  #toggle = null;
  #index = 0;
  #timer = 0;
  #paused = false;
  #hovered = false;
  #focused = false;
  #selectedInEditor = false;

  get #autoplay() {
    return this.dataset.autoplay === 'true';
  }

  get #interval() {
    return Math.max(Number(this.dataset.interval) || 5, 5) * 1000;
  }

  connectedCallback() {
    this.#slides = [...this.querySelectorAll('[data-announcement-slide]')].filter(
      (slide) => slide instanceof HTMLElement,
    );
    if (this.#slides.length < 2) return;

    this.#abort = new AbortController();
    const { signal } = this.#abort;
    this.#region = this.querySelector('[data-announcement-slides]');
    this.#toggle = this.querySelector('[data-announcement-toggle]');
    this.#index = Math.max(
      this.#slides.findIndex((slide) => slide.classList.contains('announcement-bar__slide--active')),
      0,
    );
    this.#paused = prefersReducedMotion();
    // The pointer may already rest on the bar when this module runs (no pointerenter will follow).
    this.#hovered = window.matchMedia('(hover: hover)').matches && this.matches(':hover');

    this.querySelector('[data-announcement-prev]')?.addEventListener('click', () => this.#show(this.#index - 1), {
      signal,
    });
    this.querySelector('[data-announcement-next]')?.addEventListener('click', () => this.#show(this.#index + 1), {
      signal,
    });
    this.#toggle?.addEventListener(
      'click',
      () => {
        this.#paused = !this.#paused;
        this.#sync();
      },
      { signal },
    );

    this.addEventListener('pointerenter', (event) => this.#setHovered(event, true), { signal });
    this.addEventListener('pointerleave', (event) => this.#setHovered(event, false), { signal });
    this.addEventListener(
      'focusin',
      () => {
        this.#focused = true;
        this.#sync();
      },
      { signal },
    );
    this.addEventListener(
      'focusout',
      (event) => {
        if (event.relatedTarget instanceof Node && this.contains(event.relatedTarget)) return;
        this.#focused = false;
        this.#sync();
      },
      { signal },
    );
    document.addEventListener('visibilitychange', () => this.#sync(), { signal });

    // Theme editor: show the selected message and hold it while it is selected.
    this.addEventListener(
      'shopify:block:select',
      (event) => {
        const index = this.#slides.indexOf(/** @type {HTMLElement} */ (event.target));
        if (index === -1) return;
        this.#selectedInEditor = true;
        this.#show(index);
      },
      { signal },
    );
    this.addEventListener(
      'shopify:block:deselect',
      () => {
        this.#selectedInEditor = false;
        this.#sync();
      },
      { signal },
    );

    this.#sync();
  }

  disconnectedCallback() {
    this.#abort?.abort();
    clearTimeout(this.#timer);
  }

  /**
   * @param {PointerEvent} event
   * @param {boolean} hovered
   */
  #setHovered(event, hovered) {
    if (event.pointerType !== 'mouse') return;
    this.#hovered = hovered;
    this.#sync();
  }

  /** @param {number} index - wraps around in both directions */
  #show(index) {
    const count = this.#slides.length;
    this.#index = ((index % count) + count) % count;
    for (const [position, slide] of this.#slides.entries()) {
      slide.classList.toggle('announcement-bar__slide--active', position === this.#index);
    }
    this.#sync();
  }

  /** Starts or stops the rotation timer and updates the live region and the pause button. */
  #sync() {
    clearTimeout(this.#timer);
    const rotating =
      this.#autoplay &&
      !this.#paused &&
      !this.#hovered &&
      !this.#focused &&
      !this.#selectedInEditor &&
      document.visibilityState === 'visible';
    if (rotating) this.#timer = window.setTimeout(() => this.#show(this.#index + 1), this.#interval);

    this.#region?.setAttribute('aria-live', rotating ? 'off' : 'polite');

    if (!this.#toggle) return;
    const playing = !this.#paused;
    this.#toggle.dataset.state = playing ? 'playing' : 'paused';
    const label = this.#toggle.querySelector('[data-announcement-toggle-label]');
    const text = playing ? this.#toggle.dataset.labelPause : this.#toggle.dataset.labelPlay;
    if (label && text) label.textContent = text;
  }
}

if (!customElements.get('sw-header')) customElements.define('sw-header', SwHeader);
if (!customElements.get('sw-announcement-bar')) customElements.define('sw-announcement-bar', SwAnnouncementBar);
