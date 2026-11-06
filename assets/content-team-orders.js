// Build a draft only when the shopper chooses WhatsApp; nothing is sent automatically.
class TeamOrder extends HTMLElement {
  connectedCallback() {
    if (this.abortController) return;
    this.abortController = new AbortController();
    this.querySelectorAll('[data-team-whatsapp]').forEach((link) => {
      const baseUrl = link.href;
      link.addEventListener(
        'click',
        () => {
          const form = document.getElementById(this.dataset.formId);
          if (!form) return;
          const url = new URL(baseUrl);
          const lines = [url.searchParams.get('text') || ''];
          for (const name of ['name', 'team', 'quantity', 'sizes', 'deadline', 'body']) {
            const field = form.elements.namedItem(`contact[${name}]`);
            const value = field?.value.trim();
            if (!value) continue;
            const label = field.labels?.[0]?.textContent.replace('*', '').trim();
            if (label) lines.push(`${label}: ${value}`);
          }
          url.searchParams.set('text', lines.join('\n'));
          link.href = url.href;
        },
        { signal: this.abortController.signal },
      );
    });
  }

  disconnectedCallback() {
    this.abortController?.abort();
    this.abortController = null;
  }
}

if (!customElements.get('sw-team-order')) customElements.define('sw-team-order', TeamOrder);
