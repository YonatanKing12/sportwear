/**
 * SportWear collection tabs: <sw-collection-tabs> (sections/collection-tabs.liquid).
 *
 * The chips above the row are an ARIA tab list: a click or Enter/Space shows that tab's row (every
 * row is already in the page, so nothing loads), the arrow keys move between tabs and show them
 * (Left/Right follow the page direction, so in Hebrew and Arabic Left goes to the next tab), and
 * Home/End jump to the first and last tab. Only the selected tab is in the Tab order. The chosen chip
 * is scrolled into view in the chips row. In the theme editor, selecting a tab's block shows it.
 */
import { prefersReducedMotion } from '@theme/core';

class SwCollectionTabs extends HTMLElement {
  /** @returns {HTMLElement[]} */
  get #tabs() {
    return Array.from(this.querySelectorAll('[role="tab"]'));
  }

  connectedCallback() {
    this.addEventListener('click', this.#onClick);
    this.addEventListener('keydown', this.#onKeyDown);
    document.addEventListener('shopify:block:select', this.#onBlockSelect);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.#onClick);
    this.removeEventListener('keydown', this.#onKeyDown);
    document.removeEventListener('shopify:block:select', this.#onBlockSelect);
  }

  /** @param {MouseEvent} event */
  #onClick = (event) => {
    const tab = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest('[role="tab"]'));
    if (!tab || !this.contains(tab)) return;
    this.select(this.#tabs.indexOf(tab), false);
  };

  /** @param {KeyboardEvent} event */
  #onKeyDown = (event) => {
    const tabs = this.#tabs;
    const current = tabs.indexOf(/** @type {HTMLElement} */ (event.target));
    if (current === -1) return;
    const rtl = getComputedStyle(this).direction === 'rtl';
    let next = -1;
    switch (event.key) {
      case 'ArrowRight':
        next = current + (rtl ? -1 : 1);
        break;
      case 'ArrowLeft':
        next = current + (rtl ? 1 : -1);
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
    this.select((next + tabs.length) % tabs.length, true);
  };

  /** @param {Event} event */
  #onBlockSelect = (event) => {
    const target = /** @type {Element} */ (event.target);
    const index = this.#tabs.findIndex((tab) => tab === target || tab.contains(target));
    if (index !== -1) this.select(index, false);
  };

  /**
   * Shows one tab's row and hides the others.
   * @param {number} index
   * @param {boolean} focus - Move the focus to the tab (keyboard use)
   */
  select(index, focus) {
    const tabs = this.#tabs;
    const selected = tabs[index];
    if (!selected) return;
    tabs.forEach((tab) => {
      const isSelected = tab === selected;
      tab.setAttribute('aria-selected', String(isSelected));
      tab.tabIndex = isSelected ? 0 : -1;
      const panelId = tab.getAttribute('aria-controls');
      const panel = panelId ? document.getElementById(panelId) : null;
      if (panel) panel.hidden = !isSelected;
    });
    if (focus) selected.focus({ preventScroll: true });
    selected.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }
}

if (!customElements.get('sw-collection-tabs')) customElements.define('sw-collection-tabs', SwCollectionTabs);
