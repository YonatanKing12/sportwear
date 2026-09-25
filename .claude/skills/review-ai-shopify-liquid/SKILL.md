---
name: review-ai-shopify-liquid
description: Review and audit AI-generated Shopify Liquid / theme code for correctness before it ships. Use when asked to review Liquid, check theme code, audit AI-written or copy-pasted Shopify code, or sanity-check a section/block/snippet someone (or another AI) produced. Catches hallucinated filters and tags, variant logic rebuilt in JavaScript, ignoring the Section Rendering API, hardcoded routes, raw prices, inline styles, and missing translations.
---

# Review AI-generated Shopify Liquid

AI writes Liquid that looks right and runs in the happy path, then fails in the ways only experience catches: a filter that exists in Rails but not Shopify, a price that ships as raw cents, a hardcoded `/cart` that breaks on a store in another locale. Reviewing AI-generated Liquid is now a core developer skill, because the volume of plausible-but-wrong code has gone up, not down. This skill is the checklist a senior developer runs before approving.

Go through every category. For each issue, report the line, why it's wrong, and the corrected code.

## 1. Hallucinated filters, tags, and object paths (check first)

This is the highest-risk class because it reads perfectly and simply never runs. `titleize` is the canonical example: real in Rails, fake in Shopify.

- Verify **every** filter, tag, and object path against the Shopify docs (Shopify Dev MCP `validate_theme` / `search_docs_chunks`). Do not trust memory.
- Watch for invented filters (`titleize`, `pluralize` used wrongly, made-up `money_*` variants), deprecated ones (`img_url`/`img_tag` instead of `image_url`/`image_tag`), and object properties that don't exist on that object.
- Run `validate_theme` on the actual files. If it flags a hallucination, that's a hard fail, not a warning.

## 2. Variant logic rebuilt in JavaScript

If the code reimplements variant selection, availability, or price-on-variant-change in hand-written JS, flag it. Shopify's variant system already does this and stays correct; a parallel JS implementation drifts and forgets edge cases (sold-out variants, price not updating). The fix is to use the platform variant picker and read `product.selected_or_first_available_variant`.

## 3. Cart and collection updates that ignore the Section Rendering API

AI loves to `fetch('/cart/add.js')` and then rebuild the cart DOM by hand, or reload the whole page after a filter change. Both are wrong:

- For cart drawers, quick-add, filtered grids, and infinite scroll, the **Section Rendering API** returns the server-rendered HTML for one section. Use it. Hand-rebuilt cart state is how totals and discounts go wrong.
- A full page reload where a section re-render would do is a performance and UX regression.

## 4. Hardcoded routes and URLs

- Hardcoded `/cart`, `/collections/all`, `/account` break on stores with locale or market URL prefixes. Use `routes.cart_url`, `routes.all_products_collection_url`, `routes.account_url`, and `product.url` / `collection.url`.
- Hardcoded asset paths instead of `asset_url` / `image_url`.

## 5. Raw prices

`{{ product.price }}` ships `1999`. Any price output must go through `money`, `money_with_currency`, or `money_without_trailing_zeros`. Manual `divided_by: 100` is also wrong (it breaks zero-decimal currencies).

## 6. Inline styles and hardcoded strings

- Inline `style="..."` inside `text`/`richtext` settings is stripped on push; component CSS belongs in `{% stylesheet %}`.
- User-facing strings hardcoded in English instead of `{{ 'key' | t }}`. And watch for `{{ 'x' | t: default: '...' }}`, which fails the push (reserved-name error).

## 7. Schema and structure traps

- `"default": ""` on a setting that requires a value: rejected by the live CLI.
- `{% doc %}` used in a section (only valid in snippets/blocks).
- A filter inside a Liquid comparison operand: `{% if i == n | plus: 1 %}`.
- A `for` loop over a large collection with no `{% paginate %}` (50-iteration cap).
- A block `"type"` that doesn't resolve to a real `blocks/<type>.liquid` file.
- Missing `{{ block.shopify_attributes }}` on block wrappers, so the editor can't move them.

## 8. Accessibility and image basics

- `<div onclick>` instead of `<button>`; missing labels; `outline: none` with no focus replacement.
- Raw `<img>` without dimensions (layout shift) instead of `image_tag`.

## How to deliver the review

Run `validate_theme` first to catch hallucinations and syntax mechanically, then read for the judgment issues above that no validator catches (JS variant logic, ignored Section Rendering API, raw prices, hardcoded routes). Group findings by severity: **blockers** (won't run, will ship wrong data, fails push), **should-fix** (works but wrong approach, will rot), **polish**. Give corrected code for every blocker.

## When to use this skill

Reviewing, auditing, or sanity-checking any Shopify Liquid, especially code written by an AI or copied from elsewhere, before it ships. To *write* correct code in the first place, use `shopify-theme-best-practices` and the dedicated audit skills.
