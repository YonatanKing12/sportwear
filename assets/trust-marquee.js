/** Loop one decorative copy; expose the benefits once to assistive technology. */
class TrustMarquee extends HTMLElement {
  connectedCallback() {
    this.controller?.abort();
    this.controller = new AbortController();
    const { signal } = this.controller;
    const track = this.querySelector('.trust-strip__track');
    const list = track?.querySelector('.trust-strip__list');
    const button = this;
    if (!list) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      track.querySelector('[data-clone]')?.remove();
      this.toggleAttribute('data-animated', !motion.matches);
      if (motion.matches) {
        button.removeAttribute('role');
        button.removeAttribute('tabindex');
        button.removeAttribute('aria-label');
      } else {
        button.setAttribute('role', 'group');
        button.setAttribute('tabindex', '0');
        button.setAttribute(
          'aria-label',
          this.hasAttribute('data-paused') ? button.dataset.labelPlay : button.dataset.labelPause,
        );
      }
      if (motion.matches) return;
      const clone = list.cloneNode(true);
      clone.dataset.clone = '';
      clone.setAttribute('aria-hidden', 'true');
      clone.inert = true;
      clone
        .querySelectorAll('[data-shopify-editor-block]')
        .forEach((node) => node.removeAttribute('data-shopify-editor-block'));
      track.append(clone);
    };
    button.addEventListener(
      'click',
      () => {
        if (motion.matches) return;
        const paused = this.toggleAttribute('data-paused');
        button.setAttribute('aria-label', paused ? button.dataset.labelPlay : button.dataset.labelPause);
      },
      { signal },
    );
    this.addEventListener(
      'keydown',
      (event) => {
        if (!motion.matches && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          this.click();
        }
      },
      { signal },
    );
    motion.addEventListener('change', sync, { signal });
    sync();
  }
  disconnectedCallback() {
    this.controller?.abort();
  }
}
if (!customElements.get('sw-trust-marquee')) customElements.define('sw-trust-marquee', TrustMarquee);
