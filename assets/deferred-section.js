/**
 * SportWear deferred sections: <sw-deferred-section> (snippets/deferred-section.liquid).
 *
 * A section far down a page (sections/featured-collection.liquid, collection-tabs, collection-circles
 * with "load when the visitor scrolls near it") first renders as a light outline. When the outline
 * comes within about two screens of the viewport, this renders the section alone through the Section
 * Rendering API (section.index is nil there, so it renders in full) and puts it in place of the
 * outline, inside the same #shopify-section-<id> wrapper. Scripts in the new markup are re-created so
 * they run (each module loads once per page). If the request fails, the section's wrapper is hidden
 * rather than left as an empty outline.
 */
import { fetchSection, replaceContent } from '@theme/core';

class SwDeferredSection extends HTMLElement {
  /** @type {IntersectionObserver | null} */
  #observer = null;

  connectedCallback() {
    if (!('IntersectionObserver' in window)) {
      this.#load();
      return;
    }
    this.#observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        this.#observer?.disconnect();
        this.#load();
      },
      { rootMargin: '1200px 0px' },
    );
    this.#observer.observe(this);
  }

  disconnectedCallback() {
    this.#observer?.disconnect();
  }

  async #load() {
    const sectionId = this.dataset.sectionId;
    const wrapper = sectionId ? document.getElementById(`shopify-section-${sectionId}`) : null;
    if (!sectionId || !wrapper) return;
    try {
      const html = await fetchSection(sectionId, window.location.pathname);
      if (!replaceContent(wrapper, html, `#shopify-section-${CSS.escape(sectionId)}`)) {
        throw new Error('The section came back empty');
      }
      wrapper.querySelectorAll('script').forEach((original) => {
        const script = document.createElement('script');
        for (const { name, value } of Array.from(original.attributes)) script.setAttribute(name, value);
        script.textContent = original.textContent;
        original.replaceWith(script);
      });
    } catch (error) {
      wrapper.hidden = true;
      console.warn(`Section ${sectionId} could not be loaded`, error);
    }
  }
}

if (!customElements.get('sw-deferred-section')) customElements.define('sw-deferred-section', SwDeferredSection);
