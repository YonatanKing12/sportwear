/**
 * SportWear collector cards: <sw-collector-cards> (sections/collection-circles.liquid).
 *
 * On a computer with a mouse, a card tilts toward the pointer: the card turns a few degrees, the big
 * number behind the jersey and the jersey itself shift in opposite directions, and a glare follows the
 * pointer. The script only sets --px and --py (-1 to 1, the pointer's position from the card's center)
 * on the card; the CSS does the rest. Nothing moves with touch, or when the visitor prefers reduced motion.
 */
import { prefersReducedMotion } from '@theme/core';

class SwCollectorCards extends HTMLElement {
  /** @type {WeakMap<HTMLElement, number>} */
  #frames = new WeakMap();
  #active = false;

  connectedCallback() {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches || prefersReducedMotion()) return;
    this.#active = true;
    this.addEventListener('pointermove', this.#onMove);
    this.addEventListener('pointerout', this.#onOut);
  }

  disconnectedCallback() {
    if (!this.#active) return;
    this.removeEventListener('pointermove', this.#onMove);
    this.removeEventListener('pointerout', this.#onOut);
  }

  /** @param {PointerEvent} event */
  #onMove = (event) => {
    if (event.pointerType !== 'mouse') return;
    const card = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest('a.collector-card'));
    if (!card) return;
    const box = card.getBoundingClientRect();
    const x = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1);
    const y = Math.min(Math.max((event.clientY - box.top) / box.height, 0), 1);
    cancelAnimationFrame(this.#frames.get(card) ?? 0);
    this.#frames.set(
      card,
      requestAnimationFrame(() => {
        card.dataset.tilting = '';
        card.style.setProperty('--px', ((x - 0.5) * 2).toFixed(3));
        card.style.setProperty('--py', ((y - 0.5) * 2).toFixed(3));
      }),
    );
  };

  /** @param {PointerEvent} event */
  #onOut = (event) => {
    const card = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest('a.collector-card'));
    if (!card || (event.relatedTarget instanceof Node && card.contains(event.relatedTarget))) return;
    cancelAnimationFrame(this.#frames.get(card) ?? 0);
    delete card.dataset.tilting;
    card.style.removeProperty('--px');
    card.style.removeProperty('--py');
  };
}

if (!customElements.get('sw-collector-cards')) customElements.define('sw-collector-cards', SwCollectorCards);
