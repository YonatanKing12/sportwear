/**
 * SportWear header components. ES module loaded by sections/header.liquid and, when it has more than
 * one message, sections/announcement-bar.liquid (the browser runs it once).
 *
 *   <sw-header>            sticky behaviour, --header-height, the desktop mega menu and dropdowns
 *   <sw-drill-menu>        drill-down category panels in the mobile menu drawer
 *   <sw-announcement-bar>  calm carousel for two to five announcements
 */
import { EVENTS, closeDrawer, prefersReducedMotion, subscribe } from '@theme/core';

/** Scroll distance (px) that counts as a deliberate scroll up or down. */
const SCROLL_THRESHOLD = 8;
/** Hover intent: how long the mouse rests on a menu item before its panel opens (ms). */
const OPEN_DELAY = 140;
/** Grace period after the mouse leaves an item and its panel, so a slip does not close it (ms). */
const CLOSE_DELAY = 260;
/** The mega menu exists from this width (sections/header.liquid shows the menu button below it). */
const desktopQuery = window.matchMedia('(min-width: 990px)');
/** Only a real mouse opens panels on hover; touch and pens open them with a tap. */
const hoverQuery = window.matchMedia('(hover: hover) and (pointer: fine)');

/* ---------------------------------------------------------------------------------------------
 * <sw-header data-sticky="none|always|scroll-up">
 *
 * --header-height (on <html>) is the space the header covers at the top of the viewport: its height
 * while it is sticky and shown, 0px when it scrolls away with the page (sticky "none") or is hidden
 * while scrolling down ("scroll-up"). Sticky elements and anchors offset with
 * `top: var(--header-height, 0px)` (base.css already uses it for scroll-padding).
 *
 * "scroll-up": the header hides while the visitor scrolls down and comes back when they scroll up,
 * when focus moves into it, or near the top of the page. It never hides while keyboard focus is
 * inside it. Hiding closes any open panel or dropdown.
 *
 * Mega menu (details[data-mega] in snippets/header-menu): the details/summary base works without
 * JavaScript; this adds
 * - hover intent for mouse users: a panel opens after the pointer rests on its item for OPEN_DELAY
 *   and closes CLOSE_DELAY after the pointer leaves both the item and the panel (WCAG 1.4.13:
 *   the panel can be hovered, stays until dismissed, and Escape dismisses it);
 * - a click on an item that hover has just opened pins the panel open instead of closing it;
 * - one panel at a time (the details share name="HeaderMenu"), Escape closes and returns focus to
 *   the item, a click outside (on the dimmed page) closes, focus leaving the item closes;
 * - panels close when the header hides, when a drawer or the search opens, and below 990px.
 * Other dropdowns in the bar (the language switcher) share the outside click, focus and Escape
 * handling.
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
  /** @type {HTMLDetailsElement[]} the mega menu disclosures */
  #menus = [];
  #openTimer = 0;
  /** @type {HTMLDetailsElement | null} the panel waiting for its hover delay */
  #openTarget = null;
  #closeTimer = 0;
  /** @type {HTMLDetailsElement | null} the panel waiting for its grace period */
  #closeTarget = null;

  get #mode() {
    return this.dataset.sticky ?? 'none';
  }

  connectedCallback() {
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    this.#bar = this.querySelector('.header');
    this.#stickyElement = /** @type {HTMLElement} */ (this.closest('.header-section') ?? this);
    this.#menus = [...this.querySelectorAll('details[data-mega]')].filter(
      (details) => details instanceof HTMLDetailsElement,
    );

    if (this.#bar) {
      this.#resizeObserver = new ResizeObserver(() => this.#measure());
      this.#resizeObserver.observe(this.#bar);
      this.#measure();

      this.#bar.addEventListener('toggle', this.#onToggle, { capture: true, signal });
      this.#bar.addEventListener('focusout', this.#onFocusOut, { signal });
    }

    for (const details of this.#menus) {
      details.parentElement?.addEventListener('pointerenter', this.#onItemEnter, { signal });
      details.parentElement?.addEventListener('pointerleave', this.#onItemLeave, { signal });
      details.querySelector(':scope > summary')?.addEventListener('click', this.#onSummaryClick, { signal });
    }

    this.#lastScrollY = window.scrollY;
    this.#updateNaturalTop();
    window.addEventListener('scroll', this.#onScroll, { passive: true, signal });
    if (this.#mode === 'scroll-up') {
      this.addEventListener('focusin', () => this.#setHidden(false), { signal });
    }

    desktopQuery.addEventListener(
      'change',
      () => {
        if (!desktopQuery.matches) this.#closeMenus();
      },
      { signal },
    );
    // Back/forward cache: a page restored after a click in a panel comes back with the panel closed.
    window.addEventListener(
      'pageshow',
      (event) => {
        if (event.persisted) this.#closeDropdowns();
      },
      { signal },
    );

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

    // Theme editor: bring the header back into view when its section is selected, and show the
    // panel of a selected "Mega menu promo" block.
    document.addEventListener(
      'shopify:section:select',
      (event) => {
        if (event.target instanceof Node && event.target.contains(this)) this.#setHidden(false);
      },
      { signal },
    );
    document.addEventListener(
      'shopify:block:select',
      (event) => {
        const details = this.#menuContaining(event.target);
        if (!details) return;
        this.#setHidden(false);
        this.#openMenu(details, 'editor');
      },
      { signal },
    );
    document.addEventListener(
      'shopify:block:deselect',
      (event) => {
        const details = this.#menuContaining(event.target);
        if (details) details.open = false;
      },
      { signal },
    );
  }

  disconnectedCallback() {
    this.#abort?.abort();
    this.#resizeObserver?.disconnect();
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    this.#cancelOpen();
    this.#cancelClose();
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
    if (this.#mode !== 'scroll-up') {
      // Sticky "none": once the bar has scrolled out of view, its panel would leave only a dimmed page.
      if (this.#mode === 'none' && this.#openMenus().length && (this.#bar?.getBoundingClientRect().bottom ?? 0) <= 0) {
        this.#closeMenus();
      }
      return;
    }

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
   * Keyboard focus inside the bar (a visitor tabbing through a panel or dropdown) keeps the header in
   * place. Focus that only returned to a button after a tap or click does not, and neither does a
   * panel opened with the mouse: it closes as the header hides.
   */
  #isBusy() {
    return Boolean(this.#bar?.querySelector(':focus-visible'));
  }

  /** @param {boolean} hidden */
  #setHidden(hidden) {
    if (this.#mode !== 'scroll-up' || hidden === this.#hidden) return;
    this.#hidden = hidden;
    if (hidden) this.#closeDropdowns();
    this.#stickyElement.toggleAttribute('data-header-hidden', hidden);
    this.#publishHeight();
  }

  /** @returns {HTMLDetailsElement[]} every open dropdown in the bar (mega panels, language) */
  #openDropdowns() {
    return this.#bar ? [...this.#bar.querySelectorAll('details[open]')] : [];
  }

  #openMenus() {
    return this.#menus.filter((details) => details.open);
  }

  #closeDropdowns() {
    this.#cancelOpen();
    this.#cancelClose();
    for (const details of this.#openDropdowns()) details.open = false;
  }

  #closeMenus() {
    this.#cancelOpen();
    this.#cancelClose();
    for (const details of this.#openMenus()) details.open = false;
  }

  /**
   * @param {EventTarget | null} target
   * @returns {HTMLDetailsElement | null} the mega menu disclosure that contains target
   */
  #menuContaining(target) {
    if (!(target instanceof Element)) return null;
    const details = target.closest('details[data-mega]');
    return details instanceof HTMLDetailsElement && this.#menus.includes(details) ? details : null;
  }

  /**
   * @param {HTMLDetailsElement} details
   * @param {'hover' | 'click' | 'editor'} source - hover-opened panels close when the pointer leaves
   */
  #openMenu(details, source) {
    // Moving from one open panel to another swaps them without replaying the fade-in.
    if (this.#menus.some((other) => other !== details && other.open)) {
      this.setAttribute('data-menu-switch', '');
      requestAnimationFrame(() => requestAnimationFrame(() => this.removeAttribute('data-menu-switch')));
    }
    this.#setPanelTop();
    details.dataset.openedBy = source;
    details.open = true;
  }

  /** The panel may fill the viewport below the bar; beyond that it scrolls inside. */
  #setPanelTop() {
    const bottom = this.#bar?.getBoundingClientRect().bottom ?? 0;
    this.style.setProperty('--header-mega-top', `${Math.max(Math.round(bottom), 0)}px`);
  }

  #cancelOpen() {
    clearTimeout(this.#openTimer);
    this.#openTarget = null;
  }

  #cancelClose() {
    clearTimeout(this.#closeTimer);
    this.#closeTarget = null;
  }

  /** @param {PointerEvent} event */
  #hoverApplies(event) {
    return event.pointerType === 'mouse' && hoverQuery.matches && desktopQuery.matches;
  }

  /** @param {PointerEvent} event */
  #onItemEnter = (event) => {
    if (!this.#hoverApplies(event)) return;
    const details = this.#menuContaining(/** @type {Element} */ (event.currentTarget).firstElementChild);
    if (!details) return;
    if (this.#closeTarget === details) this.#cancelClose();
    if (details.open || this.#openTarget === details) return;
    this.#cancelOpen();
    this.#openTarget = details;
    this.#openTimer = window.setTimeout(() => {
      this.#openTarget = null;
      this.#openMenu(details, 'hover');
    }, OPEN_DELAY);
  };

  /** @param {PointerEvent} event */
  #onItemLeave = (event) => {
    if (!this.#hoverApplies(event)) return;
    const details = this.#menuContaining(/** @type {Element} */ (event.currentTarget).firstElementChild);
    if (!details) return;
    if (this.#openTarget === details) this.#cancelOpen();
    if (!details.open || details.dataset.openedBy !== 'hover') return;
    this.#cancelClose();
    this.#closeTarget = details;
    this.#closeTimer = window.setTimeout(() => {
      this.#closeTarget = null;
      if (details.dataset.openedBy === 'hover') details.open = false;
    }, CLOSE_DELAY);
  };

  /**
   * Toggles a panel on click, Enter or Space. A panel that hover opened a moment ago stays open
   * (the click pins it) instead of closing under the pointer.
   * @param {MouseEvent} event
   */
  #onSummaryClick = (event) => {
    const details = /** @type {HTMLElement} */ (event.currentTarget).parentElement;
    if (!(details instanceof HTMLDetailsElement)) return;
    event.preventDefault();
    this.#cancelOpen();
    this.#cancelClose();
    if (!details.open) {
      this.#openMenu(details, 'click');
    } else if (details.dataset.openedBy === 'hover') {
      details.dataset.openedBy = 'click';
    } else {
      details.open = false;
    }
  };

  /** @param {Event} event */
  #onToggle = (event) => {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement)) return;
    if (!details.open) {
      delete details.dataset.openedBy;
      return;
    }
    for (const other of this.#openDropdowns()) {
      if (other !== details && !other.contains(details)) other.open = false;
    }
    if (this.#menus.includes(details) && !details.dataset.openedBy) {
      // Opened some other way (e.g. before this script ran).
      details.dataset.openedBy = 'click';
      this.#setPanelTop();
    }
  };

  /** @param {KeyboardEvent} event */
  #onKeydown = (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    this.#cancelOpen();
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
 * <sw-drill-menu> (the menu drawer's body, snippets/menu-drawer)
 *
 * Turns the first-level disclosures (details[data-drill]) into drill-down panels: opening one
 * slides its panel over the list (CSS in snippets/menu-drawer) and moves focus to the panel's back
 * button; the back button or Escape closes the panel and returns focus to its row (a second Escape
 * closes the drawer). The drawer starts on the first level every time it opens. Without JavaScript
 * the same markup works as accordions.
 * ------------------------------------------------------------------------------------------- */
class SwDrillMenu extends HTMLElement {
  /** @type {AbortController | null} */
  #abort = null;
  /** @type {HTMLDetailsElement | null} the open panel */
  #current = null;

  connectedCallback() {
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    this.addEventListener('toggle', this.#onToggle, { capture: true, signal });
    this.addEventListener('click', this.#onClick, { signal });
    const dialog = this.closest('dialog');
    dialog?.addEventListener('keydown', this.#onKeydown, { signal });
    dialog?.addEventListener('close', () => this.#reset(), { signal });

    const open = this.querySelector('details[data-drill][open]');
    if (open instanceof HTMLDetailsElement) this.#enter(open, false);
  }

  disconnectedCallback() {
    this.#abort?.abort();
  }

  /** @param {Event} event */
  #onToggle = (event) => {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement) || !details.hasAttribute('data-drill')) return;
    if (details.open) this.#enter(details, true);
    else if (details === this.#current) this.#leave();
  };

  /**
   * @param {HTMLDetailsElement} details
   * @param {boolean} moveFocus
   */
  #enter(details, moveFocus) {
    for (const other of this.querySelectorAll('details[data-drill][open]')) {
      if (other !== details && other instanceof HTMLDetailsElement) other.open = false;
    }
    this.#current = details;
    this.setAttribute('data-drilled', '');
    const panel = details.querySelector('.menu-drawer__panel');
    if (panel) panel.scrollTop = 0;
    if (moveFocus) {
      /** @type {HTMLElement | null} */ (details.querySelector('[data-drill-back]'))?.focus({ preventScroll: true });
    }
  }

  #leave() {
    this.#current = null;
    this.removeAttribute('data-drilled');
  }

  /** Closes the open panel and puts focus back on its row. */
  #back() {
    const details = this.#current;
    if (!details) return;
    details.open = false;
    this.#leave();
    /** @type {HTMLElement | null} */ (details.querySelector(':scope > summary'))?.focus();
  }

  /** @param {MouseEvent} event */
  #onClick = (event) => {
    if (event.target instanceof Element && event.target.closest('[data-drill-back]')) this.#back();
  };

  /** @param {KeyboardEvent} event */
  #onKeydown = (event) => {
    if (event.key !== 'Escape' || !this.#current) return;
    // Escape steps back to the first level before it closes the drawer.
    event.preventDefault();
    this.#back();
  };

  #reset() {
    for (const details of this.querySelectorAll('details[data-drill][open]')) {
      if (details instanceof HTMLDetailsElement) details.open = false;
    }
    this.#leave();
  }
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
if (!customElements.get('sw-drill-menu')) customElements.define('sw-drill-menu', SwDrillMenu);
if (!customElements.get('sw-announcement-bar')) customElements.define('sw-announcement-bar', SwAnnouncementBar);
