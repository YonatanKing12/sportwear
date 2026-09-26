/**
 * <sw-validated-form>: accessible, translated client-side validation for the content forms
 * (contact, team orders, article comments, newsletter, password page).
 *
 * Progressive enhancement: without JavaScript the browser's own validation (required, type=email)
 * and Shopify's server-side errors still work. With it, the form switches to novalidate and:
 *   - shows the theme's translated message under each invalid field ("{control id}-error"),
 *   - sets aria-invalid and links the message with aria-describedby,
 *   - moves focus to the first invalid field,
 *   - clears a field's error as soon as it becomes valid,
 *   - after a page reload with a server status ([data-form-status]), moves focus to that status.
 *
 *   <sw-validated-form data-error-required="…" data-error-email="…" data-error-invalid="…">
 *     <form …>
 *       <input id="X" required aria-describedby="X-hint">
 *       <p id="X-error" hidden><span data-error-text></span></p>
 *     </form>
 *   </sw-validated-form>
 */
class ValidatedForm extends HTMLElement {
  /** @type {HTMLFormElement | null} */
  #form = null;
  #submitting = false;

  connectedCallback() {
    this.#form = this.querySelector('form');
    if (!this.#form) return;
    this.#form.noValidate = true;
    this.#form.addEventListener('submit', this.#onSubmit);
    this.#form.addEventListener('input', this.#onInput);
    this.#form.addEventListener('change', this.#onInput);
    window.addEventListener('pageshow', this.#onPageShow);
    this.#focusStatus();
  }

  disconnectedCallback() {
    this.#form?.removeEventListener('submit', this.#onSubmit);
    this.#form?.removeEventListener('input', this.#onInput);
    this.#form?.removeEventListener('change', this.#onInput);
    window.removeEventListener('pageshow', this.#onPageShow);
  }

  /** @param {SubmitEvent} event */
  #onSubmit = (event) => {
    if (this.#submitting) {
      event.preventDefault();
      return;
    }
    const invalid = this.#controls().filter((control) => !this.#validate(control));
    if (invalid.length) {
      event.preventDefault();
      invalid[0].focus();
      return;
    }
    this.#submitting = true;
    this.#form?.setAttribute('aria-busy', 'true');
  };

  /** @param {Event} event */
  #onInput = (event) => {
    const control = /** @type {HTMLInputElement} */ (event.target);
    if (control.getAttribute('aria-invalid') === 'true') this.#validate(control);
  };

  /** Coming back through the browser's back/forward cache: allow submitting again. */
  #onPageShow = () => {
    this.#submitting = false;
    this.#form?.removeAttribute('aria-busy');
  };

  /** @returns {Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>} */
  #controls() {
    if (!this.#form) return [];
    return [...this.#form.elements].filter(
      (element) =>
        (element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement) &&
        element.willValidate &&
        element.id,
    );
  }

  /**
   * @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} control
   * @returns {boolean} whether the control is valid
   */
  #validate(control) {
    if (control.checkValidity()) {
      this.#setError(control, '');
      return true;
    }
    this.#setError(control, this.#messageFor(control));
    return false;
  }

  /** @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} control */
  #messageFor(control) {
    const { validity } = control;
    if (validity.valueMissing) return this.dataset.errorRequired ?? control.validationMessage;
    if (validity.typeMismatch && control.type === 'email') return this.dataset.errorEmail ?? control.validationMessage;
    return this.dataset.errorInvalid ?? control.validationMessage;
  }

  /**
   * Shows (or clears, with an empty message) the error under a control.
   * @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} control
   * @param {string} message
   */
  #setError(control, message) {
    const error = document.getElementById(`${control.id}-error`);
    const text = error?.querySelector('[data-error-text]');
    const describedBy = new Set((control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));

    if (message) {
      control.setAttribute('aria-invalid', 'true');
      if (error && text) {
        text.textContent = message;
        error.hidden = false;
        describedBy.add(error.id);
      }
    } else {
      control.removeAttribute('aria-invalid');
      if (error) {
        error.hidden = true;
        describedBy.delete(error.id);
      }
    }

    if (describedBy.size) control.setAttribute('aria-describedby', [...describedBy].join(' '));
    else control.removeAttribute('aria-describedby');
  }

  /** After a submission reloads the page, focus the server-rendered success or error status. */
  #focusStatus() {
    const status = this.querySelector('[data-form-status]');
    if (!(status instanceof HTMLElement)) return;
    requestAnimationFrame(() => status.focus());
  }
}

if (!customElements.get('sw-validated-form')) customElements.define('sw-validated-form', ValidatedForm);
