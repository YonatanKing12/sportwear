// Minimal drawer + add-to-cart for the preview smoke theme. Exercises the preview server's Cart
// AJAX API and Section Rendering API the same way the real theme's @theme/core does.

class SmokeDrawer extends HTMLElement {
  get dialog() {
    return this.querySelector(':scope > dialog');
  }

  open(opener) {
    if (!this.dialog || this.dialog.open) return;
    this.opener = opener ?? null;
    this.dialog.showModal();
    for (const trigger of document.querySelectorAll(`[data-drawer-open="${this.id}"]`)) {
      trigger.setAttribute('aria-expanded', 'true');
    }
  }

  close() {
    this.dialog?.close();
    for (const trigger of document.querySelectorAll(`[data-drawer-open="${this.id}"]`)) {
      trigger.setAttribute('aria-expanded', 'false');
    }
    this.opener?.focus();
  }

  connectedCallback() {
    this.addEventListener('click', (event) => {
      if (event.target.closest('[data-drawer-close]') || event.target === this.dialog) this.close();
    });
  }
}

if (!customElements.get('sw-drawer')) customElements.define('sw-drawer', SmokeDrawer);

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-drawer-open]');
  if (!trigger) return;
  const drawer = document.getElementById(trigger.dataset.drawerOpen);
  if (!(drawer instanceof SmokeDrawer)) return;
  event.preventDefault();
  drawer.open(trigger);
});

document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.dataset.type !== 'add-to-cart') return;
  event.preventDefault();
  const body = new FormData(form);
  body.set('sections', 'cart-drawer');
  body.set('sections_url', window.location.pathname);
  const response = await fetch(`${window.smoke.routes.cart_add_url}.js`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body,
  });
  const data = await response.json();
  const html = data.sections?.['cart-drawer'];
  if (html) {
    const next = new DOMParser().parseFromString(html, 'text/html').querySelector('[data-cart-drawer-body]');
    document.querySelector('[data-cart-drawer-body]')?.replaceChildren(...(next?.childNodes ?? []));
  }
  document.getElementById('CartDrawer')?.open(form.querySelector('[type="submit"]'));
});
