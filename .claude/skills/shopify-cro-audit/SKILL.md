---
name: shopify-cro-audit
description: Audit a Shopify storefront for conversion rate optimization and propose the highest-impact changes. Use when asked to improve conversion, lift sales, review a product page (PDP), collection page, cart, or checkout for friction, increase add-to-cart or checkout rate, or do a CRO review. Covers PDP clarity, sticky add-to-cart, trust signals, image quality, cart and checkout friction, mobile experience, honest urgency, and the metrics that actually move revenue.
---

# Shopify CRO audit

Conversion rate optimization is not a pile of tricks. It is the removal of every reason a ready-to-buy customer hesitates. A Shopify store converts at roughly 1-3% on average; the gap between a 1.5% store and a 3% store is usually not traffic, it is friction on the path from product page to confirmed order. Your job is to find that friction and propose the change that removes it, ranked by impact.

Audit in this order, because this is the order money leaks out.

## 1. The product page is where the decision is made

Most carts are won or lost on the PDP. Check, in priority order:

- **Above the fold answers the three questions.** Within the first screen on mobile, the customer must see: what is it (title + a real hero image), what does it cost (`money`-formatted price, compare-at shown when discounted), and how do I buy it (a visible add-to-cart). If any of the three is below the fold on a phone, that is the first fix.
- **Add-to-cart is always reachable.** On long PDPs, a sticky add-to-cart bar that appears on scroll lifts conversion measurably. The button label is action text ("Add to cart"), never a vague "Submit".
- **Images sell.** Multiple angles, zoom, lifestyle plus on-white, and at least one image that shows scale or use. A single catalog photo is a conversion ceiling.
- **The benefit is stated, not just the spec.** "100% merino" is a spec; "warm without the itch" is why they buy. Specs belong in an accordion below the fold.
- **Trust lives next to the buy button.** Returns policy, shipping timeframe, and payment options within eye-line of the CTA remove the "what if" hesitation at the exact moment it occurs.
- **Reviews are present and real.** Social proof near the price is one of the strongest levers. Use a reviews app (Loox, Judge.me, Stamped, Yotpo), not a homemade widget. If there are no reviews yet, that is a merchandising task, not a theme task.

## 2. Variant selection must be frictionless

- Out-of-stock variants should be visible but clearly unavailable, not hidden (hiding them makes the customer think the size simply doesn't exist).
- The price and image update the instant a variant is chosen. Use Shopify's variant picker so this is automatic; a hand-rolled JS picker that forgets to update the price is a silent conversion killer.
- Don't pre-select a variant that's out of stock and leave the button dead with no explanation.

## 3. The cart is a decision point, not a formality

- **A cart drawer (slide cart) beats a full-page redirect** for most stores: it keeps the customer on the PDP and lets them keep shopping. The Section Rendering API makes this fast without a reload.
- **Show the gap to free shipping.** "You're $12 away from free shipping" is one of the highest-ROI cart elements there is, because it raises average order value and gives a reason to add one more item.
- **No surprise costs.** Shipping and tax expectations set in the cart prevent the abandonment that happens when they first appear at checkout.
- **One clear primary action.** The checkout button is the loudest thing in the cart. "Continue shopping" is a quiet text link, not a competing button.

## 4. Checkout: remove every avoidable step

Checkout itself is largely Shopify-controlled (and on Plus, customizable via checkout extensions), but the run-up to it is yours:

- **Enable accelerated checkout** (Shop Pay, and the express wallets). Shop Pay's returning-customer conversion is materially higher; turning it off to "keep the design clean" costs real money.
- **Don't force account creation** before purchase. Guest checkout, every time. Offer the account after the order.
- **Match the promise.** If the PDP said "ships free," the checkout must not surprise them with a shipping line.

## 5. Mobile is the store

Most Shopify traffic is mobile. Audit the store on a phone viewport first, not last:

- Tap targets at least 44px. A buy button you have to aim at is a buy button some people miss.
- No horizontal scroll, no text smaller than 14px, no hover-only interactions (there is no hover on touch).
- The hero image must load fast and not push the buy button down. A slow LCP on mobile is a conversion problem before it is a Lighthouse score. See the `shopify-performance-audit` skill.

## 6. Urgency and scarcity, done honestly

Real scarcity converts. Fake scarcity converts once and then burns trust (and in many regions it is illegal).

- "Only 3 left" is fine **if it reads from real inventory** (`variant.inventory_quantity`), never a random number or a hardcoded constant.
- A countdown timer is fine for a real sale with a real end time, never a perpetual "ends in 10:00" that resets on reload.
- Low-stock and back-in-stock signals from real data build trust; invented ones destroy it.

## How to deliver the audit

For each finding, give three things: **what** is wrong, **why** it costs conversions (the mechanism, not "best practice"), and the **specific change** with a rough impact tier. Rank findings high/medium/low by expected lift, not by how easy they are to fix. A merchant wants to know what to do Monday morning, in order.

Lead with the two or three changes most likely to move the number. A PDP that buries the price on mobile and a cart with no free-shipping signal will out-earn ten micro-tweaks to button radius.

## When to use this skill

When the goal is more sales from the same traffic: PDP/collection/cart/checkout reviews, "why isn't this converting," add-to-cart rate, average order value, mobile experience, or a full CRO audit of a Shopify store. For pure speed work use `shopify-performance-audit`; for findability use `shopify-seo-structured-data`.
