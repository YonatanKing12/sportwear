# Legal texts

The store's legal texts, kept exactly as they are (or will be) in Shopify. Prettier skips this folder so the files stay
byte-for-byte comparable with the store.

## What is where (2026-09-27)

| Text | Where it lives | State |
| --- | --- | --- |
| Shipping & returns page (`/pages/shipping-returns`) | `pages/shipping-returns.{he,en,ar}.html` | **Live.** Hebrew body set with `pageUpdate` (page `gid://shopify/Page/162272149808`); English and Arabic title and body registered with `translationsRegister` |
| Accessibility statement (`/pages/accessibility`) | `pages/accessibility.{he,en,ar}.html` | **Live**, same way (page `gid://shopify/Page/162272182576`). Accessibility requests go through the contact page until the owner gives a contact name, phone and email |
| Refund policy, terms of service, privacy policy, shipping policy | `policies/*.he.html` | **Waiting for the owner to paste them.** The Shopify connector has no `write_legal_policies` scope, so `shopPolicyUpdate` is refused |
| Contact information policy | built on the paste page from the owner's details | Waiting for the business details |

The policies live on the store now are the owner's own (checked 2026-09-27 21:00 UTC): the refund policy is Shopify's
template translated to Hebrew (30 days, the line "[INSERT RETURN ADDRESS]" and the owner's personal email), the terms of
service start with a pasted chat preamble ("הנה טיוטת Terms of Service לחנות SportWear:"), and the privacy policy is
Shopify's English template with the owner's personal details. There is no shipping policy yet.

## The paste page

The owner pastes the policies from https://claude.ai/code/artifact/9e4da37c-1a78-4630-9b76-3cb5c20d8455. The page has:

- a form for the business details (name, ID number, address, phone, WhatsApp, email, hours, VAT-exempt): every detail
  filled in goes into the texts, and an empty one is left out, so every version pastes without placeholders. The
  details stay in the owner's browser (`localStorage`);
- a copy button per policy (rich text for Shopify's editor, or the HTML code for its HTML view);
- the Shopify return rules to set (45 days, customer pays return shipping, no restocking fee);
- what to do about each Google Merchant Center notice of 2026-09-27.

`scripts/legal/policies.js` builds the texts. The page runs it, and `scripts/legal/build-policies.mjs` runs the same
code to write `policies/*.he.html`, so the page and these files cannot drift apart:

```bash
node scripts/legal/build-policies.mjs --date 2026-09-27                   # legal/policies/*.he.html
node scripts/legal/build-policies.mjs --date 2026-09-27 --page out.html   # plus the page, to republish at the URL above
```

The page source is `paste-page.src.html`; its `/*POLICIES_JS*/` slot receives the builder.

## Decisions in the texts

Taken on the owner's behalf on 2026-09-27 ("תטפל כבר בכל המעטפת המשפטית"), all following our earlier
recommendations. The owner can change any of them.

- Returns or exchanges within 45 days of delivery. The item must be unworn (trying it on is fine), unwashed and with its
  tags on. The owner had said "unopened"; we recommended this wording instead.
- No cancellation fee.
- The customer pays return shipping, except for a faulty item or the wrong item, which the store collects.
- Refund to the original payment method within 14 days of the return or cancellation notice.
- A damaged or incomplete package is reported with a photo within 7 days of delivery.
- Business days for the 10-day delivery promise: Sunday to Thursday, without Saturdays and holidays.
- Prices include VAT, as the site already says. A checkbox on the page switches the terms to a VAT-exempt business.
- The legal cancellation rights are stated as the law gives them: 14 days, and 4 months for senior citizens, people with
  disabilities and new immigrants when the order involved a conversation.

None of it has been reviewed by a lawyer yet. The points for the lawyer are on the legal drafts page:
https://claude.ai/code/artifact/81442e94-2e3a-49a1-accb-4e113a95fd39 (and the full terms draft with its notes:
https://claude.ai/code/artifact/dce0b2bd-e3ab-491d-881e-74eebf55ea14).

## After the owner pastes

1. Read the pasted bodies back (`shop { shopPolicies { type body } }`) and update `policies/*.he.html` if the owner
   filled in details.
2. Write English and Arabic versions and register them on each `ShopPolicy` with `translationsRegister` (the digests
   come from `translatableResourcesByIds`).
3. Check `/policies/*` in he/en/ar, the product page's shipping and returns accordion and the checkout footer links.

## Updating a page

Edit `pages/<page>.he.html`, push it with `pageUpdate` (body), then fetch the new digest with
`translatableResourcesByIds` and register the English and Arabic bodies again: a changed Hebrew body marks the old
translations outdated.
