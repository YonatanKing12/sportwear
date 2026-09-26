/**
 * Theme editor helper for the content sections, loaded only when request.design_mode is true.
 * Opens a collapsed FAQ answer (<details>) when the owner selects its block in the editor, so the
 * block being edited is always visible.
 */
document.addEventListener('shopify:block:select', (event) => {
  const target = event.target;
  if (target instanceof HTMLDetailsElement) target.open = true;
});
