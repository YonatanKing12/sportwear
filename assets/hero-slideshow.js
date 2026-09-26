/**
 * SportWear hero slideshow: <sw-slideshow> (sections/hero-slideshow.liquid).
 *
 * Full-width slides in a scroll-snap track (swipe and trackpads scroll it natively). Every few seconds
 * the next slide scrolls in; rotation pauses while the pointer is over the slideshow, while focus is
 * inside it, while the tab is hidden, when the visitor presses the pause button, and entirely when the
 * visitor prefers reduced motion (WCAG 2.2.2). Dots jump to a slide. Slides out of view are inert, so
 * keyboard and screen-reader users only meet the visible slide. Right-to-left pages scroll from 0 to
 * negative values; the direction sign comes from the track's computed direction.
 */
import { prefersReducedMotion } from '@theme/core';

class SwSlideshow extends HTMLElement {
  #index = 0;
  #timer = 0;
  #frame = 0;
  #paused = false;
  #hovered = false;
  #focused = false;

  get #track() {
    return /** @type {HTMLElement | null} */ (this.querySelector('[data-slideshow-track]'));
  }

  get #slides() {
    return /** @type {HTMLElement[]} */ ([...this.querySelectorAll('[data-slide]')]);
  }

  get #toggle() {
    return /** @type {HTMLButtonElement | null} */ (this.querySelector('[data-slideshow-toggle]'));
  }

  connectedCallback() {
    if (this.#slides.length < 2) return;
    this.#paused = this.dataset.autoplay !== 'true' || prefersReducedMotion();
    this.#track?.addEventListener('scroll', this.#onScroll, { passive: true });
    this.addEventListener('click', this.#onClick);
    this.addEventListener('pointerenter', this.#onPointerEnter);
    this.addEventListener('pointerleave', this.#onPointerLeave);
    this.addEventListener('focusin', this.#onFocusIn);
    this.addEventListener('focusout', this.#onFocusOut);
    document.addEventListener('visibilitychange', this.#sync);
    this.#setActive(0);
    this.#sync();
  }

  disconnectedCallback() {
    this.#track?.removeEventListener('scroll', this.#onScroll);
    this.removeEventListener('click', this.#onClick);
    this.removeEventListener('pointerenter', this.#onPointerEnter);
    this.removeEventListener('pointerleave', this.#onPointerLeave);
    this.removeEventListener('focusin', this.#onFocusIn);
    this.removeEventListener('focusout', this.#onFocusOut);
    document.removeEventListener('visibilitychange', this.#sync);
    clearInterval(this.#timer);
    cancelAnimationFrame(this.#frame);
  }

  /** @param {PointerEvent} event */
  #onPointerEnter = (event) => {
    if (event.pointerType !== 'mouse') return;
    this.#hovered = true;
    this.#sync();
  };

  #onPointerLeave = () => {
    this.#hovered = false;
    this.#sync();
  };

  #onFocusIn = () => {
    this.#focused = true;
    this.#sync();
  };

  /** @param {FocusEvent} event */
  #onFocusOut = (event) => {
    if (event.relatedTarget instanceof Node && this.contains(event.relatedTarget)) return;
    this.#focused = false;
    this.#sync();
  };

  /** @param {MouseEvent} event */
  #onClick = (event) => {
    const target = /** @type {Element} */ (event.target);
    const dot = /** @type {HTMLElement | null} */ (target.closest('[data-slideshow-dot]'));
    if (dot) {
      this.#go(Number(dot.dataset.slideshowDot));
      this.#sync();
      return;
    }
    if (target.closest('[data-slideshow-toggle]')) {
      this.#paused = !this.#paused;
      this.#sync();
    }
  };

  #onScroll = () => {
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(() => {
      const track = this.#track;
      if (!track || !track.clientWidth) return;
      this.#setActive(Math.round(Math.abs(track.scrollLeft) / track.clientWidth));
    });
  };

  /** @param {number} index */
  #go(index) {
    const track = this.#track;
    if (!track) return;
    const count = this.#slides.length;
    const next = ((index % count) + count) % count;
    const sign = getComputedStyle(track).direction === 'rtl' ? -1 : 1;
    track.scrollTo({ left: sign * next * track.clientWidth, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    this.#setActive(next);
  }

  /** @param {number} index */
  #setActive(index) {
    const slides = this.#slides;
    this.#index = Math.min(Math.max(index, 0), slides.length - 1);
    slides.forEach((slide, i) => {
      slide.inert = i !== this.#index;
    });
    this.querySelectorAll('[data-slideshow-dot]').forEach((dot, i) => {
      if (i === this.#index) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
  }

  /** Starts or stops the rotation timer and keeps the pause button in step. */
  #sync = () => {
    clearInterval(this.#timer);
    const toggle = this.#toggle;
    if (toggle) {
      toggle.dataset.state = this.#paused ? 'paused' : 'playing';
      const label = toggle.querySelector('[data-slideshow-toggle-label]');
      if (label) label.textContent = (this.#paused ? toggle.dataset.labelPlay : toggle.dataset.labelPause) ?? '';
    }
    if (this.#paused || this.#hovered || this.#focused || document.hidden) return;
    const seconds = Math.max(Number(this.dataset.interval) || 6, 4);
    this.#timer = window.setInterval(() => this.#go(this.#index + 1), seconds * 1000);
  };
}

if (!customElements.get('sw-slideshow')) customElements.define('sw-slideshow', SwSlideshow);
