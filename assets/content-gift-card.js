/**
 * Gift card page (templates/gift_card.liquid): QR code, copy-code and print buttons.
 * Progressive enhancement: the code, value and links work without JavaScript; the buttons and the
 * QR code only appear when the browser can use them. The QR code comes from Shopify's own
 * vendor/qrcode.js (loaded with defer before this module), as Shopify documents for this template.
 */

/** Draws the QR code of the gift card (gift_card.qr_identifier). */
function renderQrCode() {
  const container = document.querySelector('[data-qr-code]');
  const figure = document.querySelector('[data-qr-figure]');
  const QRCode = /** @type {any} */ (window).QRCode;
  if (!(container instanceof HTMLElement) || !figure || typeof QRCode !== 'function') return;

  new QRCode(container, {
    text: container.dataset.qrCode ?? '',
    width: 120,
    height: 120,
  });
  // The container is the labelled image (role="img"); its generated children are decoration.
  container.removeAttribute('title');
  for (const child of container.querySelectorAll('img, canvas')) {
    child.setAttribute('aria-hidden', 'true');
    if (child instanceof HTMLImageElement) child.alt = '';
  }
  figure.hidden = false;
}

/** Copies the gift card code to the clipboard and confirms it in a status message. */
function setUpCopyButton() {
  const button = document.querySelector('[data-copy-code]');
  const status = document.querySelector('[data-copy-status]');
  if (!(button instanceof HTMLButtonElement) || !status || !navigator.clipboard) return;

  let timer;
  button.hidden = false;
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copyCode ?? '');
      status.textContent = button.dataset.copied ?? '';
    } catch {
      status.textContent = button.dataset.copyFailed ?? '';
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      status.textContent = '';
    }, 4000);
  });
}

function setUpPrintButton() {
  const button = document.querySelector('[data-print]');
  if (!(button instanceof HTMLButtonElement) || typeof window.print !== 'function') return;
  button.hidden = false;
  button.addEventListener('click', () => window.print());
}

renderQrCode();
setUpCopyButton();
setUpPrintButton();
