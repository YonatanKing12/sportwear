---
name: shopify-metafields-architect
description: Design and read custom data on Shopify the right way, using metafields and metaobjects instead of parsing titles, handles, or tags. Use when asked to store custom product/variant/customer data, add a custom field, model structured data, build size charts or spec tables or ingredient lists, link related records, or read metafield/metaobject values in Liquid. Covers choosing metafield vs metaobject, defining the schema, and reading typed values via product.metafields and metaobject references.
---

# Shopify metafields architect

When a merchant says "I need an extra field on the product," the professional answer is almost always a metafield, and the amateur answer is almost always parsing it out of the title or a tag. The difference matters because content fields are not a database: the moment someone renames a product or reorders the tags, title-parsing logic breaks silently and ships wrong data to the storefront. Metafields and metaobjects give you a typed, named, schema-backed place for custom data that survives edits.

## The decision: metafield or metaobject

- **Metafield** = a custom field *attached to* an existing resource (product, variant, collection, customer, shop). "This product's care instructions." "This variant's GTIN." Reach for this first.
- **Metaobject** = a custom *record type* you define, that resources can link to. "A designer" with name, bio, and photo, referenced by many products. "A size chart" shared across a collection. Use this when the data is its own entity, reused across resources, or has multiple fields of its own.

Rule of thumb: if the data belongs to one product, it's a metafield on the product. If the data is a thing in its own right that several products point at, it's a metaobject the products reference (via a metafield of type "metaobject reference").

## Define the schema first (one-time setup)

Metafields and metaobjects are not free-text; they have types. Define them in **Settings → Custom data** (or via the Admin API) before reading them:

1. Choose the owner resource (e.g. Product) or create a metaobject definition.
2. Add fields with the right type: single-line text, rich text, integer, boolean, file, color, date, URL, product/collection/metaobject reference, etc. The type is what makes `.value` come back as a real object instead of a string.
3. Pick a namespace and key (e.g. `custom.material`). The `custom` namespace is the default app-reserved space for merchant data.

Skipping the definition is the usual reason a metafield "doesn't work": an undefined metafield isn't exposed to the storefront.

## Read it in Liquid with `.value`

Typed metafields expose `.value`, which returns the actual typed value (a string, a number, a real `metaobject`, a `file_reference` object), not a handle.

```liquid
{# Simple typed metafield #}
{{ product.metafields.custom.material.value }}

{# Boolean drives display logic #}
{% if product.metafields.custom.is_handmade.value %}
  <span class="badge">{{ 'product.handmade' | t }}</span>
{% endif %}
```

For a metaobject reference, `.value` returns the metaobject itself, and you read its fields with `.value` too:

```liquid
{% assign designer = product.metafields.custom.designer.value %}
{% if designer %}
  <div class="designer">
    <p class="designer__name">{{ designer.name.value }}</p>
    <p class="designer__bio">{{ designer.bio.value }}</p>
  </div>
{% endif %}
```

## The theme-editor-first pattern

For merchant-facing blocks, lead with theme-editor settings so the section works the moment it's dropped in, and layer a metafield as an *optional* override for power users who'd rather manage the value in the product admin:

```liquid
{% assign material = product.metafields.custom.material.value | default: block.settings.material_fallback %}
```

The merchant's expectation is "create product, set template, tweak in the editor, done." Metafield setup is friction, so support both, with editor settings as the primary path and the metafield as the override.

## Anti-patterns to refuse

- **Parsing the title/handle/tags** for structured data. `product.title | split: ' - ' | last` is a bug with a delay on it.
- **Stuffing JSON into a single text field** and parsing it in Liquid when typed fields or a metaobject would model it cleanly.
- **A localStorage/sessionStorage shadow store** for data that belongs on the resource.
- **Reading an undefined metafield** and wondering why it's blank. Define it first.

## When to use this skill

Storing or reading custom data on Shopify: custom fields, size charts, spec/ingredient lists, related-record links, designer/brand records, or any `product.metafields.*` / metaobject work. For the surrounding theme code use `shopify-theme-best-practices`; to scaffold a section that reads these values use `shopify-section-builder`.
