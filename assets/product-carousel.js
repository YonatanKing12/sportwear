/**
 * SportWear product carousel: <sw-carousel> (sections/featured-collection.liquid, layout "carousel").
 *
 * Drives the previous/next buttons of a row of product cards that scrolls sideways: each press
 * scrolls one view (the cards on screen), and a button is aria-disabled at its end of the row.
 * Swiping and trackpads scroll the row natively. Works the same in right-to-left languages, where
 * scrollLeft runs from 0 down to negative values.
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
    this.#resizeObserver = new ResizeObserver(() => this.#update());
    if (this.#track) this.#resizeObserver.observe(this.#track);
    this.#update();
  }

  disconnectedCallback() {
    this.#track?.removeEventListener('scroll', this.#onScroll);
    this.removeEventListener('click', this.#onClick);
    this.#resizeObserver?.disconnect();
    cancelAnimationFrame(this.#frame);
  }

  #onScroll = () => {
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(() => this.#update());
  };

  /** @param {MouseEvent} event */
  #onClick = (event) => {
    const button = /** @type {HTMLElement | null} */ (
      /** @type {Element} */ (event.target).closest('[data-carousel-prev], [data-carousel-next]')
    );
    const track = this.#track;
    if (!button || !track || button.getAttribute('aria-disabled') === 'true') return;
    const forward = button.hasAttribute('data-carousel-next') ? 1 : -1;
    const direction = getComputedStyle(track).direction === 'rtl' ? -1 : 1;
    track.scrollBy({
      left: forward * direction * track.clientWidth,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  };

  /** Enables each button only while there is more of the row in its direction. */
  #update() {
    const track = this.#track;
    if (!track) return;
    const max = track.scrollWidth - track.clientWidth;
    const position = Math.abs(track.scrollLeft);
    this.toggleAttribute('data-scrollable', max > 1);
    this.#setDisabled('[data-carousel-prev]', position <= 1);
    this.#setDisabled('[data-carousel-next]', position >= max - 1);
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
