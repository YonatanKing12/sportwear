/**
 * <sw-predictive-search>: search suggestions in the header search sheet (snippets/header-search.liquid).
 * Loaded as an ES module only when "Show suggestions while typing" is on.
 *
 * The input is an ARIA combobox that controls #PredictiveSearchListbox. Typing (2+ characters)
 * fetches sections/predictive-search.liquid through the Predictive Search API and the Section
 * Rendering API (debounced, in-flight requests aborted) and swaps it into [data-predictive-search-results].
 * Keys: ArrowDown / ArrowUp move the active option, Enter opens it, Escape clears the input first
 * and closes the sheet on the next press. The form still submits to the search page as usual.
 */
import { EVENTS, announce, config, debounce, fetchSection, parseHTML, subscribe } from '@theme/core';

const SECTION_ID = 'predictive-search';
const MIN_QUERY_LENGTH = 2;
const RESULT_LIMIT = 6;
const DEBOUNCE_MS = 250;

class SwPredictiveSearch extends HTMLElement {
  /** @type {AbortController | null} listeners */
  #abort = null;
  /** @type {AbortController | null} the request in flight */
  #request = null;
  /** @type {HTMLInputElement | null} */
  #input = null;
  /** @type {HTMLElement | null} */
  #results = null;
  /** @type {HTMLElement | null} */
  #liveRegion = null;
  /** Search terms of the results on screen. */
  #term = '';
  #activeIndex = -1;
  #scheduleSearch = debounce((/** @type {string} */ term) => this.#search(term), DEBOUNCE_MS);

  connectedCallback() {
    this.#input = this.querySelector('input[role="combobox"]');
    this.#results = this.querySelector('[data-predictive-search-results]');
    this.#liveRegion = this.querySelector('[data-predictive-search-live]');
    if (!this.#input || !this.#results) return;

    this.#abort = new AbortController();
    const { signal } = this.#abort;
    this.#input.addEventListener('input', this.#onInput, { signal });
    this.#input.addEventListener('keydown', this.#onKeydown, { signal });
    this.closest('dialog')?.addEventListener('close', this.#onDialogClose, { signal });

    // Reopening the sheet with a query already in the box (e.g. on the search page) shows its suggestions.
    const unsubscribe = subscribe(EVENTS.drawerOpen, ({ id }) => {
      if (id !== 'SearchModal' || !this.#results?.hidden) return;
      const term = this.#query();
      if (term.length >= MIN_QUERY_LENGTH) this.#search(term);
    });
    signal.addEventListener('abort', unsubscribe);
  }

  disconnectedCallback() {
    this.#abort?.abort();
    this.#cancelRequest();
  }

  /** @returns {string} */
  #query() {
    return this.#input?.value.trim() ?? '';
  }

  /** @returns {HTMLElement[]} */
  #options() {
    return this.#results ? [...this.#results.querySelectorAll('[role="option"]')] : [];
  }

  #onInput = () => {
    const term = this.#query();
    if (term.length < MIN_QUERY_LENGTH) {
      this.#cancelRequest();
      this.#collapse();
      return;
    }
    if (term === this.#term && !this.#results?.hidden) {
      // Back to the terms already on screen (e.g. a trailing space was typed).
      this.#cancelRequest();
      this.#setLoading(false);
      return;
    }
    this.#setLoading(true);
    this.#scheduleSearch(term);
  };

  /** @param {string} term */
  async #search(term) {
    if (!this.isConnected || term !== this.#query()) return;
    this.#cancelRequest();
    const request = new AbortController();
    this.#request = request;
    this.#setLoading(true);

    const url = new URL(config().routes.predictive_search_url, window.location.origin);
    url.searchParams.set('q', term);
    url.searchParams.set('resources[type]', 'product,collection,query');
    url.searchParams.set('resources[limit]', String(RESULT_LIMIT));
    url.searchParams.set('resources[options][unavailable_products]', 'last');

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
        if (term === this.#query()) this.#setLoading(false);
      }
    }
  }

  /**
   * @param {string} html - the rendered predictive-search section
   * @param {string} term
   */
  #render(html, term) {
    const content = parseHTML(html).querySelector('[data-predictive-search]');
    if (!content || !this.#results || !this.#input) {
      this.#collapse();
      return;
    }
    this.#results.replaceChildren(content);
    this.#results.hidden = false;
    this.#term = term;
    this.#activeIndex = -1;
    this.#input.removeAttribute('aria-activedescendant');
    this.#input.setAttribute('aria-expanded', String(this.#options().length > 0));

    const message = content.querySelector('[data-predictive-search-announcement]')?.textContent?.trim();
    if (message) this.#announce(message);
  }

  /**
   * The page-level live region is inert while this modal dialog is open, so use the one inside it.
   * @param {string} message
   */
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
        const options = this.#options();
        if (this.#results?.hidden || !options.length) return;
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const from = this.#activeIndex === -1 && step < 0 ? options.length : this.#activeIndex;
        this.#setActive((from + step + options.length) % options.length, options);
        break;
      }
      case 'Enter': {
        const option = this.#options()[this.#activeIndex];
        if (!option || this.#results?.hidden) return;
        event.preventDefault();
        option.click();
        break;
      }
      case 'Escape': {
        // First Escape clears the search; with an empty box the dialog closes as usual.
        if (!this.#input?.value) return;
        event.preventDefault();
        this.#input.value = '';
        this.#cancelRequest();
        this.#collapse();
        break;
      }
    }
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

  #onDialogClose = () => {
    this.#cancelRequest();
    if (this.#term !== this.#query()) {
      this.#collapse();
      return;
    }
    this.#setLoading(false);
    this.#resetActive();
  };

  #cancelRequest() {
    this.#request?.abort();
    this.#request = null;
  }

  /** Hides and empties the results. */
  #collapse() {
    this.#term = '';
    this.#setLoading(false);
    this.#resetActive();
    this.#input?.setAttribute('aria-expanded', 'false');
    if (!this.#results) return;
    this.#results.hidden = true;
    this.#results.replaceChildren();
  }

  /** @param {boolean} loading */
  #setLoading(loading) {
    this.toggleAttribute('data-loading', loading);
    this.#results?.setAttribute('aria-busy', String(loading));
  }
}

if (!customElements.get('sw-predictive-search')) customElements.define('sw-predictive-search', SwPredictiveSearch);
