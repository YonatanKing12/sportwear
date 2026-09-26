/**
 * <sw-content-tabs>: turns stacked content panels into accessible tabs (WAI-ARIA tabs pattern with
 * automatic activation). Used by the size guide.
 *
 *   <sw-content-tabs>
 *     <div role="tablist" aria-label="…">
 *       <button type="button" role="tab" id="a-tab" aria-controls="a" aria-selected="true" tabindex="0">A</button>
 *       <button type="button" role="tab" id="b-tab" aria-controls="b" aria-selected="false" tabindex="-1">B</button>
 *     </div>
 *     <section id="a">…</section>
 *     <section id="b">…</section>
 *   </sw-content-tabs>
 *
 * Without JavaScript the tablist stays hidden (.js-only) and both panels are shown. Keyboard:
 * Arrow keys move between tabs (mirrored in right-to-left languages), Home / End jump to the first
 * / last tab. A URL hash matching a panel id (e.g. #size-guide-kids) selects that tab.
 */
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

class ContentTabs extends HTMLElement {
  /** @type {HTMLButtonElement[]} */
  #tabs = [];
  /** @type {Array<HTMLElement | null>} */
  #panels = [];

  connectedCallback() {
    this.#tabs = [...this.querySelectorAll('[role="tab"]')].filter(
      /** @returns {tab is HTMLButtonElement} */ (tab) => tab instanceof HTMLButtonElement,
    );
    this.#panels = this.#tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls') ?? ''));
    if (!this.#tabs.length) return;

    this.#panels.forEach((panel, index) => {
      if (!panel) return;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', this.#tabs[index].id);
      // A panel without focusable content is itself a tab stop, so keyboard users can reach it.
      if (!panel.querySelector(FOCUSABLE)) panel.tabIndex = 0;
    });

    const fromHash = this.#indexForHash();
    const preselected = this.#tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
    this.select(fromHash >= 0 ? fromHash : Math.max(preselected, 0));
    // The browser could not scroll to a panel that was hidden while the page loaded.
    if (fromHash >= 0) requestAnimationFrame(() => this.scrollIntoView({ block: 'start' }));

    this.addEventListener('click', this.#onClick);
    this.addEventListener('keydown', this.#onKeydown);
    window.addEventListener('hashchange', this.#onHashChange);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.#onClick);
    this.removeEventListener('keydown', this.#onKeydown);
    window.removeEventListener('hashchange', this.#onHashChange);
  }

  /**
   * @param {number} index
   * @param {{ focus?: boolean }} [options]
   */
  select(index, { focus = false } = {}) {
    this.#tabs.forEach((tab, tabIndex) => {
      const selected = tabIndex === index;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      const panel = this.#panels[tabIndex];
      if (panel) panel.hidden = !selected;
    });
    if (focus) this.#tabs[index]?.focus();
  }

  get #currentIndex() {
    return this.#tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
  }

  #indexForHash() {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return -1;
    return this.#panels.findIndex((panel) => panel?.id === id);
  }

  /** @param {MouseEvent} event */
  #onClick = (event) => {
    const tab = /** @type {Element} */ (event.target).closest('[role="tab"]');
    if (!(tab instanceof HTMLButtonElement)) return;
    const index = this.#tabs.indexOf(tab);
    if (index >= 0) this.select(index);
  };

  /** @param {KeyboardEvent} event */
  #onKeydown = (event) => {
    if (!(event.target instanceof HTMLElement) || event.target.getAttribute('role') !== 'tab') return;
    const last = this.#tabs.length - 1;
    const step = getComputedStyle(this).direction === 'rtl' ? -1 : 1;
    let index = this.#currentIndex;

    switch (event.key) {
      case 'ArrowRight':
        index += step;
        break;
      case 'ArrowLeft':
        index -= step;
        break;
      case 'Home':
        index = 0;
        break;
      case 'End':
        index = last;
        break;
      default:
        return;
    }

    event.preventDefault();
    if (index < 0) index = last;
    if (index > last) index = 0;
    this.select(index, { focus: true });
  };

  #onHashChange = () => {
    const index = this.#indexForHash();
    if (index < 0) return;
    this.select(index);
    this.scrollIntoView({ block: 'start' });
  };
}

if (!customElements.get('sw-content-tabs')) customElements.define('sw-content-tabs', ContentTabs);
