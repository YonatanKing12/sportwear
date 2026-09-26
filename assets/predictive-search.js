/**
 * Store search. ES module loaded by the header (every page), the search page and the 404 page.
 *
 *   normalizeSearchQuery()   the query clean-up every search uses (see below)
 *   <sw-search-form>         wraps a plain search form; normalizes the query when it submits
 *   <sw-predictive-search>   the header's search field (snippets/header-search.liquid)
 *
 * <sw-predictive-search> normalizes its query on submit too. With data-predictive (Theme settings >
 * Search > "Show suggestions while typing") its input is an ARIA combobox that controls
 * #PredictiveSearchListbox: typing (2+ characters) fetches sections/predictive-search.liquid through
 * the Predictive Search API and the Section Rendering API (locale-aware URL, debounced, in-flight
 * requests aborted) into the panel under the field. Keys: ArrowDown / ArrowUp move the active option
 * (ArrowDown, like a click in the field, reopens a closed panel), Enter opens it, Escape closes the
 * panel and, with the panel closed, clears the field. A click outside, focus leaving the field and
 * the panel, and any drawer or mega panel opening close it too. The panel itself takes Tab focus so
 * a long list can be scrolled from the keyboard. The form always submits to the search page.
 */
import { EVENTS, announce, config, fetchSection, parseHTML, subscribe } from '@theme/core';

const SECTION_ID = 'predictive-search';
const MIN_QUERY_LENGTH = 2;
/** Results per type (limit_scope=each): up to 6 products, and as many collections and suggestions. */
const RESULT_LIMIT = 6;
/** Product fields to search: the defaults plus tags, which carry team, player and synonym keywords in
 * Hebrew, English and Arabic (tags are not translated, so they match in every language). */
const SEARCH_FIELDS = 'title,product_type,variants.title,vendor,tag';
const DEBOUNCE_MS = 220;

const HEBREW_LETTER = '[\\u05D0-\\u05EA]';
/** A straight or curly double quote, or two apostrophes, between Hebrew letters: gershayim (״). */
const GERSHAYIM = new RegExp(`(${HEBREW_LETTER})(?:"|\\u201C|\\u201D|''|\\u2019\\u2019)(?=${HEBREW_LETTER})`, 'g');
/** An apostrophe, a curly single quote or a backtick after a Hebrew letter: geresh (׳). */
const GERESH = new RegExp(`(${HEBREW_LETTER})['\\u2018\\u2019\`]`, 'g');

/**
 * Cleans up a search query: trims it, collapses runs of spaces, and writes the Hebrew geresh and
 * gershayim the way product titles do ("לוס אנג׳לס", "ארה״ב"), because phone keyboards type ' and ".
 * Latin and Arabic text is left alone.
 * @param {string} value
 * @returns {string}
 */
export function normalizeSearchQuery(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(GERSHAYIM, '$1״')
    .replace(GERESH, '$1׳');
}

/**
 * Shopify's Predictive Search API only serves a fixed list of languages, and Hebrew and Arabic are not
 * on it (it answers 417 there). The storefront says whether the current language is covered in
 * <script id="shopify-features">. Where it isn't, the suggestions come from the regular storefront
 * search, which works in every language, rendered by the same section.
 * @returns {boolean}
 */
function predictiveSearchSupported() {
  try {
    const features = document.getElementById('shopify-features')?.textContent;
    return Boolean(features && JSON.parse(features).predictiveSearch);
  } catch {
    return false;
  }
}

const PREDICTIVE_SUPPORTED = predictiveSearchSupported();

/**
 * The URL whose rendered predictive-search section holds the suggestions for `term`. Both endpoints
 * are locale-aware (/en/…, /ar/…), so each language searches its own content.
 * @param {string} term
 * @returns {URL}
 */
function suggestionsUrl(term) {
  const url = new URL(
    PREDICTIVE_SUPPORTED ? config().routes.predictive_search_url : config().routes.search_url,
    window.location.origin,
  );
  url.searchParams.set('q', term);
  if (PREDICTIVE_SUPPORTED) {
    url.searchParams.set('resources[type]', 'product,collection,query');
    url.searchParams.set('resources[limit]', String(RESULT_LIMIT));
    url.searchParams.set('resources[limit_scope]', 'each');
    url.searchParams.set('resources[options][fields]', SEARCH_FIELDS);
    url.searchParams.set('resources[options][prefix]', 'last');
    url.searchParams.set('resources[options][unavailable_products]', 'last');
  } else {
    url.searchParams.set('type', 'product');
    url.searchParams.set('options[prefix]', 'last');
    url.searchParams.set('options[unavailable_products]', 'last');
  }
  return url;
}

/** @param {FormDataEvent} event */
function normalizeFormData(event) {
  const value = event.formData.get('q');
  if (typeof value === 'string') event.formData.set('q', normalizeSearchQuery(value));
}

/**
 * <sw-search-form>: a plain search form (search page, 404 page) that sends the normalized query.
 * Without JavaScript the form submits as typed.
 */
class SwSearchForm extends HTMLElement {
  /** @type {AbortController | null} */
  #abort = null;

  connectedCallback() {
    this.#abort = new AbortController();
    this.querySelector('form')?.addEventListener('formdata', normalizeFormData, { signal: this.#abort.signal });
  }

  disconnectedCallback() {
    this.#abort?.abort();
  }
}

/** The mega menu and the search panel share the space under the header: one at a time. */
const desktopQuery = window.matchMedia('(min-width: 1200px)');

class SwPredictiveSearch extends HTMLElement {
  /** @type {AbortController | null} listeners */
  #abort = null;
  /** @type {AbortController | null} the request in flight */
  #request = null;
  /** @type {HTMLFormElement | null} */
  #form = null;
  /** @type {HTMLInputElement | null} */
  #input = null;
  /** @type {HTMLElement | null} */
  #panel = null;
  /** @type {HTMLElement | null} */
  #liveRegion = null;
  /** @type {HTMLButtonElement | null} */
  #clear = null;
  /** Normalized terms of the results in the panel ('' when it is empty). */
  #term = '';
  #activeIndex = -1;
  /** The debounce timer of the next search (cleared with the request, so a closed panel stays closed). */
  #timer = 0;

  connectedCallback() {
    this.#form = this.querySelector('form');
    this.#input = this.querySelector('input[name="q"]');
    this.#panel = this.querySelector('[data-predictive-search-results]');
    this.#liveRegion = this.querySelector('[data-predictive-search-live]');
    this.#clear = this.querySelector('[data-search-clear]');
    if (!this.#form || !this.#input) return;

    this.#abort = new AbortController();
    const { signal } = this.#abort;
    this.#form.addEventListener('formdata', normalizeFormData, { signal });
    this.#input.addEventListener('input', this.#onInput, { signal });
    this.#clear?.addEventListener('click', this.#onClear, { signal });
    // Back/forward cache: the page comes back with the panel closed and the clear button in sync.
    window.addEventListener(
      'pageshow',
      (event) => {
        if (event.persisted) this.#close();
        this.#syncClear();
      },
      { signal },
    );
    this.#syncClear();

    if (!this.#predictive) return;
    this.#input.addEventListener('keydown', this.#onKeydown, { signal });
    this.#input.addEventListener('click', this.#reopen, { signal });
    this.#panel?.addEventListener('keydown', this.#onPanelKeydown, { signal });
    this.addEventListener('focusout', this.#onFocusOut, { signal });
    document.addEventListener('click', this.#onDocumentClick, { signal });
    window.addEventListener('resize', () => this.#isOpen && this.#measure(), { passive: true, signal });
    // A mega panel opening (hover or click) takes the space under the header.
    document.addEventListener(
      'toggle',
      (event) => {
        if (event.target instanceof HTMLDetailsElement && event.target.open && event.target.matches('[data-mega]')) {
          this.#close();
        }
      },
      { capture: true, signal },
    );
    const unsubscribe = subscribe(EVENTS.drawerOpen, () => this.#close());
    signal.addEventListener('abort', unsubscribe);
    desktopQuery.addEventListener('change', () => this.#isOpen && this.#measure(), { signal });
  }

  disconnectedCallback() {
    this.#abort?.abort();
    this.#cancelRequest();
    this.removeAttribute('data-open');
  }

  /** Closes the suggestions panel (the header calls it when it hides or closes its dropdowns). */
  close() {
    if (this.#isOpen) this.#close();
  }

  get #predictive() {
    return this.hasAttribute('data-predictive') && Boolean(this.#panel);
  }

  get #isOpen() {
    return Boolean(this.#panel && !this.#panel.hidden);
  }

  /** @returns {string} the normalized query in the field */
  #query() {
    return normalizeSearchQuery(this.#input?.value ?? '');
  }

  /** @returns {HTMLElement[]} */
  #options() {
    return this.#panel ? [...this.#panel.querySelectorAll('[role="option"]')] : [];
  }

  #syncClear() {
    if (this.#clear && this.#input) this.#clear.hidden = this.#input.value === '';
  }

  #onInput = () => {
    this.#syncClear();
    if (!this.#predictive) return;
    const term = this.#query();
    if (term.length < MIN_QUERY_LENGTH) {
      this.#cancelRequest();
      this.#collapse();
      return;
    }
    if (term === this.#term) {
      // Back to the terms already rendered (e.g. a trailing space was typed).
      this.#cancelRequest();
      this.#setLoading(false);
      this.#open();
      return;
    }
    this.#setLoading(true);
    clearTimeout(this.#timer);
    this.#timer = window.setTimeout(() => this.#search(term), DEBOUNCE_MS);
  };

  /** A click (or ArrowDown) in the field brings back the panel for the text in it. */
  #reopen = () => {
    const term = this.#query();
    if (term.length < MIN_QUERY_LENGTH || this.#isOpen) return;
    if (term === this.#term) this.#open();
    else this.#search(term);
  };

  /**
   * The panel takes focus for keyboard scrolling; Escape there closes it and returns to the field.
   * @param {KeyboardEvent} event
   */
  #onPanelKeydown = (event) => {
    if (event.key !== 'Escape' || event.target !== this.#panel) return;
    event.preventDefault();
    this.#close();
    this.#input?.focus();
  };

  #onClear = () => {
    if (!this.#input) return;
    this.#input.value = '';
    this.#syncClear();
    this.#cancelRequest();
    this.#collapse();
    this.#input.focus();
  };

  /** @param {string} term */
  async #search(term) {
    if (!this.isConnected || term !== this.#query()) return;
    this.#cancelRequest();
    const request = new AbortController();
    this.#request = request;
    this.#setLoading(true);

    const url = suggestionsUrl(term);

    try {
      const html = await fetchSection(SECTION_ID, url.href, { signal: request.signal });
      if (term === this.#query()) this.#render(html, term);
    } catch (error) {
      if (request.signal.aborted) return;
      console.error('[predictive-search]', error);
      this.#collapse();
    } finally {
      if (this.#request === request) {
        this.#request = null;
        this.#setLoading(false);
      }
    }
  }

  /**
   * @param {string} html - the rendered predictive-search section
   * @param {string} term
   */
  #render(html, term) {
    const content = parseHTML(html).querySelector('[data-predictive-search]');
    if (!content || !this.#panel) {
      this.#collapse();
      return;
    }
    this.#panel.replaceChildren(content);
    this.#panel.scrollTop = 0;
    this.#term = term;
    this.#resetActive();
    // Results that arrive after the visitor left the field wait until they come back.
    if (!this.contains(document.activeElement)) return;
    this.#open();

    const message = content.querySelector('[data-predictive-search-announcement]')?.textContent?.trim();
    if (message) this.#announce(message);
  }

  #open() {
    if (!this.#panel || !this.#input || !this.#panel.hasChildNodes()) return;
    this.#measure();
    this.#panel.hidden = false;
    this.setAttribute('data-open', '');
    this.#input.setAttribute('aria-expanded', String(this.#options().length > 0));
  }

  /** Hides the panel and keeps its results, so focusing the field again shows them at once. */
  #close() {
    this.#cancelRequest();
    this.#setLoading(false);
    this.#resetActive();
    this.removeAttribute('data-open');
    this.#input?.setAttribute('aria-expanded', 'false');
    if (this.#panel) this.#panel.hidden = true;
  }

  /** Hides and empties the panel. */
  #collapse() {
    this.#close();
    this.#term = '';
    this.#panel?.replaceChildren();
  }

  /** The panel may fill the viewport below the header (small screens) or below the field. */
  #measure() {
    const header = this.closest('.header') ?? this;
    const edge = desktopQuery.matches ? this.getBoundingClientRect().bottom : header.getBoundingClientRect().bottom;
    this.style.setProperty('--header-search-top', `${Math.max(Math.round(edge), 0)}px`);
  }

  /** @param {string} message */
  #announce(message) {
    const region = this.#liveRegion;
    if (!region) {
      announce(message);
      return;
    }
    region.textContent = '';
    requestAnimationFrame(() => {
      region.textContent = message;
    });
  }

  /** @param {KeyboardEvent} event */
  #onKeydown = (event) => {
    if (event.isComposing) return;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        if (!this.#isOpen) {
          if (this.#query().length < MIN_QUERY_LENGTH) return;
          event.preventDefault();
          this.#reopen();
          return;
        }
        const options = this.#options();
        if (!options.length) return;
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const from = this.#activeIndex === -1 && step < 0 ? options.length : this.#activeIndex;
        this.#setActive((from + step + options.length) % options.length, options);
        break;
      }
      case 'Enter': {
        const option = this.#options()[this.#activeIndex];
        if (!option || !this.#isOpen) return;
        event.preventDefault();
        option.click();
        break;
      }
      case 'Escape': {
        // First Escape closes the panel; with the panel closed it clears the field.
        if (this.#isOpen) {
          event.preventDefault();
          this.#close();
        } else if (this.#input?.value) {
          event.preventDefault();
          this.#onClear();
        }
        break;
      }
      default:
        break;
    }
  };

  /** @param {FocusEvent} event */
  #onFocusOut = (event) => {
    const next = event.relatedTarget;
    // No related target: focus left the window, or a click landed on something that takes no focus
    // (the click handler decides).
    if (next instanceof Node && !this.contains(next)) this.#close();
  };

  /** @param {MouseEvent} event */
  #onDocumentClick = (event) => {
    if (this.#isOpen && event.target instanceof Node && !this.contains(event.target)) this.#close();
  };

  /**
   * @param {number} index
   * @param {HTMLElement[]} options
   */
  #setActive(index, options) {
    this.#activeIndex = index;
    for (const [position, option] of options.entries()) {
      option.setAttribute('aria-selected', String(position === index));
    }
    const active = options[index];
    this.#input?.setAttribute('aria-activedescendant', active.id);
    active.scrollIntoView({ block: 'nearest' });
  }

  #resetActive() {
    this.#activeIndex = -1;
    this.#input?.removeAttribute('aria-activedescendant');
    for (const option of this.#options()) option.setAttribute('aria-selected', 'false');
  }

  /** Cancels the pending search and the request in flight. */
  #cancelRequest() {
    clearTimeout(this.#timer);
    this.#request?.abort();
    this.#request = null;
  }

  /** @param {boolean} loading */
  #setLoading(loading) {
    this.toggleAttribute('data-loading', loading);
    this.#panel?.setAttribute('aria-busy', String(loading));
  }
}

if (!customElements.get('sw-search-form')) customElements.define('sw-search-form', SwSearchForm);
if (!customElements.get('sw-predictive-search')) customElements.define('sw-predictive-search', SwPredictiveSearch);
