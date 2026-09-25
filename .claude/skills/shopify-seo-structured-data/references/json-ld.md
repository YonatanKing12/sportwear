# Validated JSON-LD snippets

Every snippet below was validated against the Shopify docs with the `validate_theme` tool. Output dynamic values through the `json` filter so the JSON is always valid and escaped. Render these in a snippet and include it where the page type applies.

## Product + Offer (product template)

Shows price and availability in Google results.

```liquid
{% doc %}
  Emits Product + Offer structured data as JSON-LD for rich results.
  @param {product} product - The product to describe
{% enddoc %}

<script type="application/ld+json">
  {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": {{ product.title | json }},
    "description": {{ product.description | strip_html | truncate: 500 | json }},
    "image": {{ product.featured_image | image_url: width: 1200 | prepend: 'https:' | json }},
    "sku": {{ product.selected_or_first_available_variant.sku | json }},
    "brand": {
      "@type": "Brand",
      "name": {{ product.vendor | json }}
    },
    "offers": {
      "@type": "Offer",
      "price": {{ product.selected_or_first_available_variant.price | divided_by: 100.0 | json }},
      "priceCurrency": {{ shop.currency | json }},
      "availability": "{% if product.available %}https://schema.org/InStock{% else %}https://schema.org/OutOfStock{% endif %}",
      "url": {{ product.url | prepend: shop.url | json }}
    }
  }
</script>
```

Notes:

- `product.price` is in cents. Divide by `100.0` (float, so currencies with decimals keep them) for the `price` field.
- Only add an `aggregateRating` block when there are real reviews. Never fabricate ratings.

## BreadcrumbList (collection and product pages)

Gives Google the breadcrumb trail it can render under the result.

```liquid
{% doc %}
  Emits BreadcrumbList structured data for a product within its collection.
  @param {product} product - The current product
{% enddoc %}

<script type="application/ld+json">
  {
    "@context": "https://schema.org/",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": {{ shop.url | json }}
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": {{ product.title | json }},
        "item": {{ product.url | prepend: shop.url | json }}
      }
    ]
  }
</script>
```

Validate the rendered output against Google's Rich Results Test before shipping.
