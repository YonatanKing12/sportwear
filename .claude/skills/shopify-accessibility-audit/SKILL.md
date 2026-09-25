---
name: shopify-accessibility-audit
description: Audit and fix accessibility (WCAG 2.1 AA) on a Shopify theme. Use when asked about accessibility, a11y, WCAG, ADA compliance, screen reader support, keyboard navigation, color contrast, focus states, alt text, or accessible forms and variant pickers on a Shopify store. Covers semantic HTML, visible focus, labelled form controls, 4.5:1 contrast, 44px tap targets, and accessible interactive components.
---

# Shopify accessibility audit

Accessibility is correctness, not charity. A store that a keyboard user or screen-reader user can't check out on is a store losing those customers, and in many jurisdictions it is a legal exposure. The bar is WCAG 2.1 AA. Most theme accessibility failures are a handful of repeated mistakes, and AI-generated markup hits all of them: `<div>` buttons, missing labels, invisible focus, decorative icons announced as content.

Audit in this order.

## 1. Semantic HTML before ARIA

The first rule of ARIA is don't use ARIA when a native element does the job. A real `<button>` is focusable, clickable by keyboard, and announced correctly for free; a `<div onclick>` is none of those.

```liquid
{# BAD: not focusable, not keyboard-operable, not announced #}
<div class="add" onclick="addToCart()">Add to cart</div>

{# GOOD #}
<button type="button" class="add">{{ 'products.product.add_to_cart' | t }}</button>
```

Use `<nav>`, `<main>`, `<header>`, `<footer>`, `<button>`, `<a>`, `<details>`/`<summary>` for accordions, and a real `<dialog>` for modals. Reach for ARIA only to fill genuine gaps.

## 2. Every form control has a label

A bare input is unusable with a screen reader. Tie a `<label>` to its control with `for`/`id`. This includes the search box, the newsletter input, and quantity selectors.

```liquid
<label for="qty">{{ 'products.product.quantity' | t }}</label>
<input type="number" id="qty" name="quantity" min="1" value="1">
```

Icon-only controls (a cart icon, a close X) need an accessible name via `aria-label` since there's no visible text.

## 3. Focus must be visible and logical

Keyboard users navigate by focus. If you can't see where focus is, the site is unusable without a mouse.

- Never `outline: none` without a replacement. Provide a clear `:focus-visible` style on every interactive element.
- Tab order follows visual order. Don't reorder with large positive `tabindex` values.
- In a modal or cart drawer, trap focus inside while open and return it to the trigger on close.

## 4. Color contrast meets 4.5:1

Body text needs a 4.5:1 contrast ratio against its background (3:1 for large text). Light-grey text on white is the most common failure and it's invisible to a meaningful slice of customers. Check sale prices and "free shipping" badges specifically, since those are often styled in a low-contrast accent color and they are exactly the text you want read.

## 5. Touch targets at least 44px

A control smaller than about 44x44px is hard to hit on a phone for everyone and impossible for some. This applies to quantity steppers, swatches, close buttons, and pagination, the small controls AI tends to size by eye.

## 6. Accessible interactive components

- **Variant pickers**: real radio inputs or a labelled select, operable by keyboard, with the selected state announced. Use Shopify's variant picker so this is handled, rather than a `<div>` swatch grid that a keyboard can't reach.
- **Cart drawer / modals**: `role="dialog"`, `aria-modal="true"`, focus trapped, Escape closes, focus returns to the opener.
- **Carousels**: reachable controls, pausable autoplay, and don't hide content from the accessibility tree.
- **Images**: meaningful images get descriptive `alt`; decorative images get `alt=""` so they're skipped. (Shared with `shopify-seo-structured-data`.)

## How to deliver the audit

Test with a keyboard first (tab through the whole purchase flow without a mouse), then a screen reader on the critical path (PDP to checkout), then run an automated checker (axe) for contrast and label coverage. Automated tools catch maybe a third of issues; the keyboard pass catches the ones that actually block a sale. For each finding, give the WCAG criterion, the user it blocks, and the fix.

## When to use this skill

Accessibility, a11y, WCAG, ADA, screen reader, keyboard navigation, color contrast, focus states, or accessible forms and components on a Shopify theme.
