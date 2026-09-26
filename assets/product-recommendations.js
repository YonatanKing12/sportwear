/**
 * <sw-product-recommendations> (sections/product-recommendations.liquid).
 * Loads the section with its recommended products from routes.product_recommendations_url
 * (Section Rendering API) when it nears the viewport, swaps the skeleton for the product cards, and
 * hides the section when there is nothing to recommend or the request fails.
 */
import { parseHTML } from '@theme/core';

class SwProductRecommendations extends HTMLElement {
  /** @type {IntersectionObserver | null} */
  #observer = null;
  /** @type {AbortController | null} */
  #controller = null;

  connectedCallback() {
    // Rendered by the recommendations request itself: the products are already here.
    if (!this.hasAttribute('aria-busy')) return;
    this.#observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        this.#observer?.disconnect();
        this.#load();
      },
      { rootMargin: '0px 0px 400px 0px' },
    );
    this.#observer.observe(this);
  }

  disconnectedCallback() {
    this.#observer?.disconnect();
    this.#controller?.abort();
  }

  async #load() {
    const { url, productId, sectionId, limit, intent } = this.dataset;
    if (!url || !productId || !sectionId) {
      this.hidden = true;
      return;
    }
    const target = new URL(url, window.location.origin);
    target.searchParams.set('product_id', productId);
    target.searchParams.set('section_id', sectionId);
    if (limit) target.searchParams.set('limit', limit);
    if (intent) target.searchParams.set('intent', intent);

    const controller = new AbortController();
    this.#controller = controller;
    try {
      const response = await fetch(target, { signal: controller.signal });
      if (!response.ok) throw new Error(`Recommendations request failed (${response.status})`);
      const source = parseHTML(await response.text()).querySelector('sw-product-recommendations');
      if (!source?.querySelector('[data-recommendation]')) {
        this.hidden = true;
        return;
      }
      this.replaceChildren(...source.childNodes);
      this.removeAttribute('aria-busy');
    } catch {
      if (!controller.signal.aborted) this.hidden = true;
    }
  }
}

if (!customElements.get('sw-product-recommendations')) {
  customElements.define('sw-product-recommendations', SwProductRecommendations);
}
