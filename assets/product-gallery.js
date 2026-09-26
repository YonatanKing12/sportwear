/**
 * SportWear product gallery: <sw-product-gallery> (snippets/product-gallery.liquid).
 *
 * - Slider (every width): keeps the dots, the thumbnails and the "1 / 4" counter in step with the
 *   scroll position, announces the image number politely once scrolling settles, drives the
 *   previous/next buttons and the thumbnails, and stops media that scrolls out of view. Works the
 *   same in right-to-left languages.
 * - Zoom: the zoom buttons open the dialog through <sw-drawer> (data-drawer-open); this scrolls the
 *   dialog to the image that was clicked.
 * - Deferred media: swaps a video, external video or 3D model poster for its player on demand.
 * - Variant media: shows the media of the variant chosen in the product form (EVENTS.variantChanged).
 */
import { EVENTS, prefersReducedMotion, subscribe } from '@theme/core';

/** @type {Promise<void> | null} */
let modelViewerLoader = null;

/** Loads Shopify's 3D model viewer (model-viewer and its controls) once, on demand. */
function loadModelViewer() {
  modelViewerLoader ??= new Promise((resolve, reject) => {
    const shopify = /** @type {any} */ (window).Shopify;
    if (!shopify?.loadFeatures) {
      reject(new Error('Shopify.loadFeatures is not available'));
      return;
    }
    shopify.loadFeatures([
      {
        name: 'model-viewer-ui',
        version: '1.0',
        onLoad: (/** @type {unknown} */ errors) => (errors ? reject(errors) : resolve()),
      },
    ]);
  });
  return modelViewerLoader;
}

class SwProductGallery extends HTMLElement {
  #index = 0;
  #announced = 0;
  #zoomIndex = 0;
  #frame = 0;
  #settleTimer = 0;
  /** @type {Array<() => void>} */
  #subscriptions = [];

  get #list() {
    return /** @type {HTMLElement | null} */ (this.querySelector('[data-gallery-list]'));
  }

  /** @returns {HTMLElement[]} */
  get #items() {
    return /** @type {HTMLElement[]} */ ([...(this.#list?.querySelectorAll(':scope > [data-gallery-item]') ?? [])]);
  }

  connectedCallback() {
    this.#list?.addEventListener('scroll', this.#onScroll, { passive: true });
    this.addEventListener('click', this.#onClick);
    this.#subscriptions = [
      subscribe(EVENTS.drawerOpen, this.#onDrawerOpen),
      subscribe(EVENTS.variantChanged, this.#onVariantChanged),
    ];
    this.#update();
  }

  disconnectedCallback() {
    this.#list?.removeEventListener('scroll', this.#onScroll);
    this.removeEventListener('click', this.#onClick);
    for (const unsubscribe of this.#subscriptions) unsubscribe();
    this.#subscriptions = [];
    cancelAnimationFrame(this.#frame);
    clearTimeout(this.#settleTimer);
  }

  #onScroll = () => {
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(() => this.#update());
    clearTimeout(this.#settleTimer);
    this.#settleTimer = window.setTimeout(() => this.#settled(), 180);
  };

  /** The slide in view, from the scroll offset (scrollLeft is negative in right-to-left layouts). */
  #currentIndex() {
    const list = this.#list;
    const last = Math.max(this.#items.length - 1, 0);
    if (!list || list.clientWidth === 0) return 0;
    return Math.min(Math.max(Math.round(Math.abs(list.scrollLeft) / list.clientWidth), 0), last);
  }

  /** Dots, counter and arrows follow the slide in view. */
  #update() {
    const index = this.#currentIndex();
    const count = this.#items.length;
    this.#index = index;
    for (const [position, dot] of this.querySelectorAll('[data-gallery-dot]').entries()) {
      dot.classList.toggle('is-active', position === index);
    }
    const current = this.querySelector('[data-gallery-current]');
    if (current) current.textContent = String(index + 1);
    for (const thumb of this.querySelectorAll('[data-gallery-thumb]')) {
      const active = Number(thumb.getAttribute('data-gallery-thumb')) === index;
      thumb.setAttribute('aria-current', String(active));
      if (active) this.#reveal(thumb);
    }
    this.querySelector('[data-gallery-prev]')?.setAttribute('aria-disabled', String(index <= 0));
    this.querySelector('[data-gallery-next]')?.setAttribute('aria-disabled', String(index >= count - 1));
  }

  /** Scrolling has come to rest: announce the new image and stop media that is out of view. */
  #settled() {
    this.#update();
    const index = this.#index;
    if (index !== this.#announced) {
      this.#announced = index;
      const status = this.querySelector('[data-gallery-status]');
      const template = status?.getAttribute('data-template');
      if (status && template) {
        status.textContent = template
          .replace('[index]', String(index + 1))
          .replace('[count]', String(this.#items.length));
      }
    }
    this.#stopHiddenMedia(index);
  }

  /**
   * Scrolls the thumbnail strip (never the page) so the current thumbnail is in view.
   * @param {Element} thumb
   */
  #reveal(thumb) {
    const strip = thumb.closest('.product-gallery__thumbs');
    if (!(strip instanceof HTMLElement) || !(thumb instanceof HTMLElement)) return;
    const box = thumb.getBoundingClientRect();
    const area = strip.getBoundingClientRect();
    if (box.top < area.top) strip.scrollTop -= area.top - box.top;
    else if (box.bottom > area.bottom) strip.scrollTop += box.bottom - area.bottom;
    if (box.left < area.left) strip.scrollLeft -= area.left - box.left;
    else if (box.right > area.right) strip.scrollLeft += box.right - area.right;
  }

  /** @param {number} index - the slide in view */
  #stopHiddenMedia(index) {
    for (const [position, item] of this.#items.entries()) {
      if (position === index) continue;
      for (const video of item.querySelectorAll('video')) video.pause();
      const external = item.querySelector('[data-deferred-media="external_video"].is-active');
      if (external instanceof HTMLElement) this.#reset(external);
    }
  }

  /** @param {number} index */
  #go(index) {
    const list = this.#list;
    const count = this.#items.length;
    if (!list || count === 0) return;
    const target = Math.min(Math.max(index, 0), count - 1);
    const direction = getComputedStyle(list).direction === 'rtl' ? -1 : 1;
    list.scrollTo({
      left: direction * target * list.clientWidth,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }

  /** @param {MouseEvent} event */
  #onClick = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const arrow = target.closest('[data-gallery-prev], [data-gallery-next]');
    if (arrow) {
      if (arrow.getAttribute('aria-disabled') === 'true') return;
      this.#go(this.#index + (arrow.hasAttribute('data-gallery-next') ? 1 : -1));
      return;
    }

    const thumb = target.closest('[data-gallery-thumb]');
    if (thumb) {
      this.#go(Number(thumb.getAttribute('data-gallery-thumb')) || 0);
      return;
    }

    // <sw-drawer> opens the zoom dialog itself; remember which image asked for it.
    const zoom = target.closest('[data-zoom-index]');
    if (zoom) {
      this.#zoomIndex = Number(zoom.getAttribute('data-zoom-index')) || 0;
      return;
    }

    const play = target.closest('[data-deferred-media-button]');
    if (play) this.#activate(play.closest('[data-deferred-media]'));
  };

  /** @param {{ id?: string }} detail */
  #onDrawerOpen = ({ id }) => {
    if (!id || id !== this.dataset.zoomId) return;
    const dialog = document.getElementById(id)?.querySelector('dialog');
    const item = dialog?.querySelectorAll('[data-zoom-item]')[this.#zoomIndex];
    if (!dialog || !item) return;
    dialog.scrollTop = 0;
    if (this.#zoomIndex > 0) item.scrollIntoView({ block: 'start' });
  };

  /** Replaces a media poster with its player. @param {Element | null} host */
  async #activate(host) {
    if (!(host instanceof HTMLElement) || host.classList.contains('is-active')) return;
    const template = host.querySelector('template');
    if (!template) return;
    host.append(template.content.cloneNode(true));
    host.classList.add('is-active');

    const player = host.querySelector(':scope > :is(video, iframe, model-viewer)');
    if (!(player instanceof HTMLElement)) return;

    if (host.dataset.deferredMedia === 'model') {
      try {
        await loadModelViewer();
        const shopify = /** @type {any} */ (window).Shopify;
        if (shopify?.ModelViewerUI) new shopify.ModelViewerUI(player);
      } catch {
        this.#reset(host);
        return;
      }
    }

    player.focus({ preventScroll: true });
    if (player instanceof HTMLVideoElement) player.play().catch(() => {});
  }

  /** Puts the poster back in place of the player. @param {HTMLElement} host */
  #reset(host) {
    for (const player of host.querySelectorAll(':scope > :is(video, iframe, model-viewer)')) player.remove();
    host.classList.remove('is-active');
  }

  /** @param {{ sectionId?: string, variant?: { mediaId?: number | null } | null }} detail */
  #onVariantChanged = ({ sectionId, variant }) => {
    if (sectionId !== this.dataset.sectionId || !variant?.mediaId) return;
    const list = this.#list;
    const item = list?.querySelector(`:scope > [data-media-id="${CSS.escape(String(variant.mediaId))}"]`);
    if (!list || !(item instanceof HTMLElement)) return;
    this.#go(this.#items.indexOf(item));
  };
}

if (!customElements.get('sw-product-gallery')) customElements.define('sw-product-gallery', SwProductGallery);
