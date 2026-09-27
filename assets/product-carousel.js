/**
 * SportWear product carousel: <sw-carousel> (sections/featured-collection.liquid, layout "carousel").
 *
 * Drives the previous/next buttons of a row of product cards that scrolls sideways: each press
 * scrolls one view (the cards on screen), and a button is aria-disabled at its end of the row.
 * Keeps the progress bar in step (--carousel-visible: the share of the row on screen,
 * --carousel-progress: 0 at the start, 1 at the end). Swiping and trackpads scroll the row natively.
 * Works the same in right-to-left languages, where scrollLeft runs from 0 down to negative values.
 * A card that gets keyboard focus while partly outside the row is scrolled fully into view.
 */
import { prefersReducedMotion } from '@theme/core';

class SwCarousel extends HTMLElement {
  #frame = 0;
  /** @type {ResizeObserver | null} */
  #resizeObserver = null;

  get #track() {
    return /** @type {HTMLElement | null} */ (this.querySelector('[data-carousel-track]'));
  }

  connectedCallback() {
    this.#track?.addEventListener('scroll', this.#onScroll, { passive: true });
    this.addEventListener('click', this.#onClick);
    this.addEventListener('focusin', this.#onFocusIn);
    this.#resizeObserver = new ResizeObserver(() => this.#update());
    if (this.#track) this.#resizeObserver.observe(this.#track);
    this.#update();
  }

  disconnectedCallback() {
    this.#track?.removeEventListener('scroll', this.#onScroll);
    this.removeEventListener('click', this.#onClick);
    this.removeEventListener('focusin', this.#onFocusIn);
    this.#resizeObserver?.disconnect();
    cancelAnimationFrame(this.#frame);
  }

  #onScroll = () => {
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(() => this.#update());
  };

  /** @param {FocusEvent} event */
  #onFocusIn = (event) => {
    const track = this.#track;
    const target = /** @type {Element} */ (event.target);
    if (!track || !track.contains(target)) return;
    const item = /** @type {HTMLElement | null} */ (target.closest('[data-carousel-track] > *'));
    if (!item) return;
    const itemBox = item.getBoundingClientRect();
    const trackBox = track.getBoundingClientRect();
    if (itemBox.left >= trackBox.left && itemBox.right <= trackBox.right) return;
    item.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  /** @param {MouseEvent} event */
  #onClick = (event) => {
    const button = /** @type {HTMLElement | null} */ (
      /** @type {Element} */ (event.target).closest('[data-carousel-prev], [data-carousel-next]')
    );
    const track = this.#track;
    if (!button || !track || button.getAttribute('aria-disabled') === 'true') return;
    const forward = button.hasAttribute('data-carousel-next') ? 1 : -1;
    const style = getComputedStyle(track);
    const direction = style.direction === 'rtl' ? -1 : 1;
    // One view is the cards area (the row's side padding aligns it with the page); snapping then
    // lands on the card that was peeking in.
    const view = track.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd);
    track.scrollBy({
      left: forward * direction * view,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  };

  /** Enables each button only while there is more of the row in its direction, and moves the progress bar. */
  #update() {
    const track = this.#track;
    if (!track) return;
    const max = track.scrollWidth - track.clientWidth;
    const position = Math.min(Math.abs(track.scrollLeft), Math.max(max, 0));
    this.toggleAttribute('data-scrollable', max > 1);
    this.#setDisabled('[data-carousel-prev]', position <= 1);
    this.#setDisabled('[data-carousel-next]', position >= max - 1);
    this.style.setProperty('--carousel-visible', (track.clientWidth / track.scrollWidth).toFixed(4));
    this.style.setProperty('--carousel-progress', (max > 1 ? position / max : 0).toFixed(4));
  }

  /**
   * @param {string} selector
   * @param {boolean} disabled
   */
  #setDisabled(selector, disabled) {
    this.querySelector(selector)?.setAttribute('aria-disabled', String(disabled));
  }
}

if (!customElements.get('sw-carousel')) customElements.define('sw-carousel', SwCarousel);
