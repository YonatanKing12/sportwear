/**
 * SportWear collection and search results: storefront filtering, sorting and pagination updated in
 * place with the Section Rendering API. Loaded as a module by sections/main-collection.liquid and
 * sections/main-search.liquid.
 *
 * Everything works without JavaScript (the filter form is a GET form, every chip and page is a real
 * link); this module only enhances it:
 *
 *   <sw-facets data-section-id="{{ section.id }}" data-layout="sidebar|drawer">
 *     [data-facets-sidebar]      home of the filter form (desktop sidebar, and the no-JS fallback)
 *     [data-facets-form]         the GET filter form; the sort select joins it through form="…"
 *     [data-facets-drawer-body]  where the form moves on small screens (<sw-drawer id="FacetsDrawer">)
 *     [data-facets-region="…"]   parts replaced after each change (results, active chips, counts)
 *     [data-facets-link]         links that update the results in place (remove a filter, clear all)
 *     [data-pagination-link]     page links; [data-load-more] appends the next page instead
 *   </sw-facets>
 *
 * Also defines <sw-read-more> (long collection descriptions) and <sw-chip-scroller> (keeps the
 * current chip of a horizontal chip menu in view).
 */
import { announce, closeDrawer, fetchSection, parseHTML, prefersReducedMotion } from '@theme/core';

const DESKTOP = window.matchMedia('(min-width: 990px)');
const DRAWER_ID = 'FacetsDrawer';
const CHANGE_DELAY = 350;

/**
 * A page URL (never a Section Rendering URL) for any link or form action.
 * @param {string | URL} input
 * @returns {URL}
 */
function pageUrl(input) {
  const url = new URL(input, window.location.href);
  url.searchParams.delete('section_id');
  url.searchParams.delete('sections');
  return url;
}

/**
 * A comparable key for the filter and sort state of a URL; parameter order does not matter.
 * @param {string | URL} input
 * @param {boolean} [withPage] - Also compare the page number
 * @returns {string}
 */
function stateKey(input, withPage = false) {
  const url = pageUrl(input);
  if (!withPage) url.searchParams.delete('page');
  url.searchParams.sort();
  return `${url.pathname}?${url.searchParams}`;
}

/**
 * True for a primary click without modifier keys (modified clicks keep opening new tabs).
 * @param {MouseEvent} event
 */
function isPlainClick(event) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

class SwFacets extends HTMLElement {
  /** @type {AbortController | null} */
  #listeners = null;
  /** @type {AbortController | null} */
  #request = null;
  #timer = 0;
  /** URL of the state currently on screen. */
  #rendered = window.location.href;

  get sectionId() {
    return this.dataset.sectionId ?? '';
  }

  /** @returns {HTMLFormElement | null} */
  get form() {
    return this.querySelector('form[data-facets-form]');
  }

  connectedCallback() {
    this.#listeners = new AbortController();
    const { signal } = this.#listeners;
    this.addEventListener('change', this.#onChange, { signal });
    this.addEventListener('submit', this.#onSubmit, { signal });
    this.addEventListener('click', this.#onClick, { signal });
    window.addEventListener('popstate', this.#onPopState, { signal });
    DESKTOP.addEventListener('change', this.#placeForm, { signal });
    this.#rendered = window.location.href;
    this.#placeForm();
  }

  disconnectedCallback() {
    this.#listeners?.abort();
    this.#request?.abort();
    window.clearTimeout(this.#timer);
  }

  /** Keeps the form in the desktop sidebar, or in the drawer on small screens and in drawer layout. */
  #placeForm = () => {
    const form = this.form;
    const sidebar = this.querySelector('[data-facets-sidebar]');
    const drawerBody = this.querySelector('[data-facets-drawer-body]');
    if (!form || !sidebar || !drawerBody) return;
    const useSidebar = this.dataset.layout === 'sidebar' && DESKTOP.matches;
    const target = useSidebar ? sidebar : drawerBody;
    if (form.parentElement === target) return;
    if (useSidebar) closeDrawer(DRAWER_ID);
    target.append(form);
  };

  /** @param {Event} event */
  #onChange = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    if (!this.form || target.form !== this.form) return;
    if (target instanceof HTMLSelectElement) {
      this.#applyForm();
      return;
    }
    window.clearTimeout(this.#timer);
    this.#timer = window.setTimeout(() => this.#applyForm(), CHANGE_DELAY);
  };

  /** @param {SubmitEvent} event */
  #onSubmit = (event) => {
    if (event.target !== this.form) return;
    event.preventDefault();
    this.#applyForm();
    if (event.submitter?.hasAttribute('data-facets-apply')) closeDrawer(DRAWER_ID);
  };

  /** @param {MouseEvent} event */
  #onClick = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const toggle = target.closest('[data-facets-more]');
    if (toggle instanceof HTMLButtonElement) {
      this.#toggleMore(toggle);
      return;
    }

    const loadMore = target.closest('[data-load-more]');
    if (loadMore instanceof HTMLButtonElement) {
      this.#loadMore(loadMore);
      return;
    }

    const link = target.closest('a[data-facets-link], a[data-pagination-link]');
    if (!(link instanceof HTMLAnchorElement) || !isPlainClick(event)) return;
    event.preventDefault();
    if (link.getAttribute('aria-disabled') === 'true') return;
    const isPageLink = link.hasAttribute('data-pagination-link');
    this.#render(link.href, { withPage: isPageLink, scroll: isPageLink });
  };

  #onPopState = () => {
    if (stateKey(window.location.href, true) === stateKey(this.#rendered, true)) return;
    this.#render(window.location.href, { withPage: true, history: 'none' });
  };

  /** Renders the form's current state, unless it is already on screen. */
  #applyForm() {
    window.clearTimeout(this.#timer);
    this.#timer = 0;
    const url = this.#formUrl();
    if (!url || stateKey(url) === stateKey(this.#rendered)) return;
    this.#render(url);
  }

  /**
   * The page URL for the form's current state: empty fields and the page number are left out.
   * @returns {URL | null}
   */
  #formUrl() {
    const form = this.form;
    if (!form) return null;
    this.#tidyPriceRanges(form);
    const url = pageUrl(form.action);
    url.search = '';
    for (const [name, value] of new FormData(form)) {
      if (typeof value !== 'string' || value.trim() === '') continue;
      url.searchParams.append(name, value.trim());
    }
    return url;
  }

  /**
   * Swaps a price range typed the wrong way round (minimum above maximum).
   * @param {HTMLFormElement} form
   */
  #tidyPriceRanges(form) {
    for (const range of form.querySelectorAll('[data-price-range]')) {
      const min = range.querySelector('[data-price="min"]');
      const max = range.querySelector('[data-price="max"]');
      if (!(min instanceof HTMLInputElement) || !(max instanceof HTMLInputElement)) continue;
      const low = Number.parseFloat(min.value);
      const high = Number.parseFloat(max.value);
      if (Number.isNaN(low) || Number.isNaN(high) || low <= high) continue;
      [min.value, max.value] = [max.value, min.value];
    }
  }

  /**
   * Fetches this section for a URL and swaps the parts that changed.
   * @param {string | URL} input
   * @param {{ withPage?: boolean, scroll?: boolean, history?: 'push' | 'none' }} [options]
   */
  async #render(input, { withPage = false, scroll = false, history = 'push' } = {}) {
    const url = pageUrl(input);
    if (!withPage) url.searchParams.delete('page');

    this.#request?.abort();
    const request = new AbortController();
    this.#request = request;
    this.#setBusy(true);

    try {
      const html = await fetchSection(this.sectionId, url.href, { signal: request.signal });
      const doc = parseHTML(html);
      if (!doc.querySelector('[data-facets-results]')) throw new Error('Results not found in the section');
      this.#swap(doc);
      this.#rendered = url.href;
      if (history === 'push' && stateKey(url, true) !== stateKey(window.location.href, true)) {
        window.history.pushState({ swFacets: true }, '', url);
      }
      if (scroll) this.#scrollToResults();
      this.#announceResults();
    } catch {
      if (request.signal.aborted) return;
      // The section could not be rendered: fall back to a normal page load.
      window.location.assign(url.href);
    } finally {
      if (this.#request === request) {
        this.#request = null;
        this.#setBusy(false);
      }
    }
  }

  /** @param {boolean} busy */
  #setBusy(busy) {
    const results = this.querySelector('[data-facets-results]');
    if (busy) results?.setAttribute('aria-busy', 'true');
    else results?.removeAttribute('aria-busy');
  }

  /**
   * Replaces the filter form's groups and every region with their fresh versions, keeping open
   * groups, expanded value lists and keyboard focus where the shopper left them.
   * @param {Document} doc
   */
  #swap(doc) {
    const focused =
      document.activeElement instanceof HTMLElement && this.contains(document.activeElement)
        ? document.activeElement
        : null;
    const chips = this.querySelector('[data-facets-region="active"]');
    const chipIndex =
      focused && chips?.contains(focused)
        ? [...chips.querySelectorAll('a')].indexOf(/** @type {HTMLAnchorElement} */ (focused))
        : -1;
    const expanded = [...this.querySelectorAll('[data-facets-more][aria-expanded="true"]')].map((button) =>
      button.getAttribute('aria-controls'),
    );

    this.#swapForm(doc, focused);
    for (const region of this.querySelectorAll('[data-facets-region]')) {
      const name = region.getAttribute('data-facets-region') ?? '';
      const fresh = doc.querySelector(`[data-facets-region="${CSS.escape(name)}"]`);
      if (!fresh) continue;
      region.replaceChildren(...fresh.childNodes);
      region.toggleAttribute('hidden', fresh.hasAttribute('hidden'));
    }
    this.#syncSort(doc);
    this.#cleanLinks();

    for (const id of expanded) {
      if (!id) continue;
      const button = this.querySelector(`[data-facets-more][aria-controls="${CSS.escape(id)}"]`);
      if (button instanceof HTMLButtonElement && button.getAttribute('aria-expanded') !== 'true')
        this.#toggleMore(button);
    }
    this.#restoreFocus(focused, chipIndex);
  }

  /**
   * @param {Document} doc
   * @param {HTMLElement | null} focused
   */
  #swapForm(doc, focused) {
    const form = this.form;
    const fresh = doc.querySelector('form[data-facets-form]');
    if (!form || !fresh) return;

    for (const details of fresh.querySelectorAll('details[id]')) {
      const current = form.querySelector(`#${CSS.escape(details.id)}`);
      if (current instanceof HTMLDetailsElement) details.toggleAttribute('open', current.open);
    }
    // Keep what the shopper is typing in a price field.
    if (focused instanceof HTMLInputElement && focused.type === 'number' && focused.id && form.contains(focused)) {
      fresh.querySelector(`#${CSS.escape(focused.id)}`)?.setAttribute('value', focused.value);
    }

    const scroller = form.parentElement;
    const scrollTop = scroller?.scrollTop ?? 0;
    form.replaceChildren(...fresh.childNodes);
    if (scroller) scroller.scrollTop = scrollTop;
  }

  /** @param {Document} doc */
  #syncSort(doc) {
    for (const select of this.querySelectorAll('select[data-facets-sort]')) {
      if (!(select instanceof HTMLSelectElement)) continue;
      const selected = doc.getElementById(select.id)?.querySelector('option[selected]');
      if (selected instanceof HTMLOptionElement && select.value !== selected.value) select.value = selected.value;
    }
  }

  /** Links rendered through the Section Rendering API must stay normal page links. */
  #cleanLinks() {
    for (const link of this.querySelectorAll('a[href*="section_id="]')) {
      if (link instanceof HTMLAnchorElement) link.href = pageUrl(link.href).href;
    }
    for (const button of this.querySelectorAll('[data-next-url*="section_id="]')) {
      if (button instanceof HTMLElement) button.dataset.nextUrl = pageUrl(button.dataset.nextUrl ?? '').href;
    }
  }

  /**
   * Puts focus back where it was, or on the nearest sensible place when that element is gone.
   * @param {HTMLElement | null} focused
   * @param {number} chipIndex
   */
  #restoreFocus(focused, chipIndex) {
    if (!focused || focused.isConnected) return;

    const twin = focused.id ? document.getElementById(focused.id) : null;
    if (twin && this.contains(twin)) {
      if (!twin.matches(':disabled')) {
        twin.focus({ preventScroll: true });
        return;
      }
      const summary = twin.closest('details')?.querySelector('summary');
      if (summary) {
        summary.focus({ preventScroll: true });
        return;
      }
    }

    if (chipIndex >= 0) {
      const links = this.querySelectorAll('[data-facets-region="active"] a');
      const next = links[Math.min(chipIndex, links.length - 1)];
      if (next instanceof HTMLElement) {
        next.focus({ preventScroll: true });
        return;
      }
    }
    this.#focusResults();
  }

  #focusResults() {
    const target = this.querySelector('[data-facets-focus]');
    if (target instanceof HTMLElement) target.focus({ preventScroll: true });
  }

  #scrollToResults() {
    const results = this.querySelector('[data-facets-results]');
    if (!results) return;
    const { top } = results.getBoundingClientRect();
    if (top < 0 || top > window.innerHeight * 0.5) {
      results.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
    this.#focusResults();
  }

  #announceResults() {
    const status = this.querySelector('[data-facets-status]');
    const message = status?.textContent?.trim();
    if (message) announce(message);
  }

  /** @param {HTMLButtonElement} button */
  #toggleMore(button) {
    const list = document.getElementById(button.getAttribute('aria-controls') ?? '');
    if (!list) return;
    const expand = button.getAttribute('aria-expanded') !== 'true';
    list.classList.toggle('facets-values--collapsed', !expand);
    button.setAttribute('aria-expanded', String(expand));
    const label = expand ? button.dataset.labelLess : button.dataset.labelMore;
    if (label) button.textContent = label;
  }

  /**
   * Appends the next page of results below the current ones ("Load more").
   * @param {HTMLButtonElement} button
   */
  async #loadMore(button) {
    const nextUrl = button.dataset.nextUrl;
    // Wait for any update in progress: its results replace this page anyway.
    if (!nextUrl || this.#request) return;
    const url = pageUrl(nextUrl);

    const request = new AbortController();
    this.#request = request;
    button.setAttribute('aria-busy', 'true');

    try {
      const doc = parseHTML(await fetchSection(this.sectionId, url.href, { signal: request.signal }));
      const added = this.#appendResults(doc);
      if (!added.length) throw new Error('No results on the next page');
      this.#replacePagination(doc);
      this.#cleanLinks();
      this.#rendered = url.href;
      window.history.replaceState(window.history.state, '', url);

      const firstLink = added.map((item) => item.querySelector('a[href]')).find(Boolean);
      if (firstLink instanceof HTMLElement) firstLink.focus();
      const status = this.querySelector('[data-pagination-status]')?.textContent?.trim();
      if (status) announce(status);
    } catch {
      if (request.signal.aborted) return;
      window.location.assign(url.href);
    } finally {
      if (this.#request === request) this.#request = null;
      button.removeAttribute('aria-busy');
    }
  }

  /**
   * Moves the items of every results list of the next page into the matching list on screen.
   * @param {Document} doc
   * @returns {Element[]} the items added
   */
  #appendResults(doc) {
    /** @type {Element[]} */
    const added = [];
    for (const list of this.querySelectorAll('[data-results-list]')) {
      const name = list.getAttribute('data-results-list') ?? '';
      const fresh = doc.querySelector(`[data-results-list="${CSS.escape(name)}"]`);
      const items = fresh ? [...fresh.children] : [];
      if (!items.length) continue;
      list.append(...items);
      list.closest('[data-results-group]')?.removeAttribute('hidden');
      added.push(...items);
    }
    return added;
  }

  /** @param {Document} doc */
  #replacePagination(doc) {
    const current = this.querySelector('[data-pagination]');
    const fresh = doc.querySelector('[data-pagination]');
    if (!current || !fresh) return;
    // Page numbers stay hidden while the shopper keeps loading from page 1.
    if (current.classList.contains('pagination--load-more')) fresh.classList.add('pagination--load-more');
    current.replaceWith(fresh);
  }
}

/** Clamps a long collection description to a few lines, with a "Read more" toggle. */
class SwReadMore extends HTMLElement {
  /** @type {AbortController | null} */
  #listeners = null;

  connectedCallback() {
    const button = this.querySelector('button[aria-controls]');
    const content = button ? document.getElementById(button.getAttribute('aria-controls') ?? '') : null;
    if (!(button instanceof HTMLButtonElement) || !content || !this.classList.contains('read-more--collapsed')) return;

    // Short enough after all: show everything and drop the toggle.
    if (content.scrollHeight <= content.clientHeight + 2) {
      this.classList.remove('read-more--collapsed');
      button.hidden = true;
      return;
    }

    this.#listeners = new AbortController();
    const { signal } = this.#listeners;
    button.addEventListener('click', () => this.#toggle(button), { signal });
    // A link inside the clamped text must never receive focus while it is cut off.
    content.addEventListener(
      'focusin',
      () => {
        if (this.classList.contains('read-more--collapsed')) this.#toggle(button);
      },
      { signal },
    );
  }

  disconnectedCallback() {
    this.#listeners?.abort();
  }

  /** @param {HTMLButtonElement} button */
  #toggle(button) {
    const expand = this.classList.contains('read-more--collapsed');
    this.classList.toggle('read-more--collapsed', !expand);
    button.setAttribute('aria-expanded', String(expand));
    const label = expand ? button.dataset.labelLess : button.dataset.labelMore;
    if (label) button.textContent = label;
  }
}

/** Scrolls a horizontal chip menu so the chip of the current page is visible. */
class SwChipScroller extends HTMLElement {
  connectedCallback() {
    const scroller = this.querySelector('.scroller');
    const current = scroller?.querySelector('[aria-current="page"]');
    if (!scroller || !current || scroller.scrollWidth <= scroller.clientWidth) return;
    const box = scroller.getBoundingClientRect();
    const chip = current.getBoundingClientRect();
    if (chip.left >= box.left && chip.right <= box.right) return;
    scroller.scrollBy({ left: chip.left + chip.width / 2 - (box.left + box.width / 2), behavior: 'instant' });
  }
}

if (!customElements.get('sw-facets')) customElements.define('sw-facets', SwFacets);
if (!customElements.get('sw-read-more')) customElements.define('sw-read-more', SwReadMore);
if (!customElements.get('sw-chip-scroller')) customElements.define('sw-chip-scroller', SwChipScroller);
