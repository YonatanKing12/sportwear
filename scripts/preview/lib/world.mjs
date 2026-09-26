// Builds the Shopify object graph (drops) for one page render: products, collections, cart, menus,
// localization, routes, request, settings... Everything is locale-aware (URLs get the /en or /ar
// prefix, titles use the locale's translation).
import {
  ADULT_SIZES,
  BLOG,
  CART_LINES,
  COLLECTIONS,
  COUNTRY,
  IMAGE_ALT_SUFFIX,
  KIDS_SIZES,
  LEAGUES,
  LOCALES,
  MENUS,
  OPTION_NAME,
  PAGES,
  POLICIES,
  PRICE,
  PRODUCTS,
  PRODUCT_TYPES,
  SHOP,
  SIZE_CHARTS,
  SYSTEM_STRINGS,
  TEAMS,
  VENDOR,
  descriptionFor,
} from './catalog.mjs';
import {
  BaseDrop,
  ColorDrop,
  ColorSchemeDrop,
  MapDrop,
  MetafieldDrop,
  MetafieldNamespaceDrop,
  MetafieldsDrop,
  OptionValueDrop,
  SettingsDrop,
  ValueDrop,
  windowed,
} from './drops.mjs';
import { escapeHtml, handleize, numericId, shortHash, stripHtml } from './util.mjs';

export const CONTENT_FOR_HEADER_PLACEHOLDER = '<!--sw-preview:content_for_header-->';

/** Shopify global objects the harness does not mock: reading them is reported as a gap. */
const UNMOCKED_GLOBALS = new Set(['app', 'checkout', 'order', 'customer_address', 'discount_allocation']);

const PRODUCT_METAFIELD_KEYS = [
  'team',
  'leagues',
  'season',
  'kit',
  'audience',
  'size_chart',
  'counterpart',
  'complements',
  'source_url',
];

const t = (map, locale) => (map ? (map[locale] ?? map.he ?? Object.values(map)[0]) : null);

function emptyMetafields(owner) {
  return new MetafieldsDrop(owner, {});
}

function listOf(items) {
  const list = [...items];
  Object.defineProperty(list, 'count', { value: list.length, enumerable: false });
  return list;
}

export class World {
  /**
   * @param {object} options
   * @param {import('./preview.mjs').Preview} options.preview
   * @param {string} options.locale
   * @param {object} options.spec - page spec (see preview.mjs)
   * @param {Array<{handle: string, size: string, quantity: number}>} options.cartLines
   * @param {(kind: string, message: string) => void} options.gap
   */
  constructor({ preview, locale, spec, cartLines, gap }) {
    this.preview = preview;
    this.spec = spec;
    this.gap = gap;
    this.localeInfo = LOCALES.find((l) => l.iso_code === locale) ?? LOCALES[0];
    this.locale = this.localeInfo.iso_code;
    this.root = this.localeInfo.primary ? '' : `/${this.locale}`;
    this.path = spec.path ?? '/';
    this.requestPath = `${this.root}${this.path === '/' && this.root ? '' : this.path}` || '/';
    this.moneyFormat = preview.options.moneyFormat ?? SHOP.money_format;
    this.moneyWithCurrencyFormat = preview.options.moneyWithCurrencyFormat ?? SHOP.money_with_currency_format;

    this.images = new Map();
    this.products = new Map();
    this.collectionsByHandle = new Map();
    this.pagesByHandle = new Map();

    this.#buildImages();
    this.#buildMetaobjects();
    this.#buildProducts();
    this.#buildCollections();
    this.#buildPages();
    this.#buildBlog();
    this.#buildLocalization();
    this.cart = this.buildCart(cartLines);
    this.linklistsByHandle = new Map(Object.keys(MENUS).map((handle) => [handle, this.#buildMenu(handle)]));
    this.linklists = new MapDrop('linklists', this.linklistsByHandle);
    this.settings = this.#buildThemeSettings();
  }

  /* -------------------------------------------------------------------------------- images */

  #buildImages() {
    for (const [name, info] of this.preview.fixtureImages) this.images.set(name, this.#imageDrop(name, info));
  }

  #imageDrop(name, info, { alt = '', id, position = null, productId = null } = {}) {
    return new ValueDrop(
      'image',
      `files/${info.file}`,
      {
        id: id ?? numericId(`image:${name}`, 30000000000000),
        alt,
        width: info.width,
        height: info.height,
        aspect_ratio: Math.round((info.width / info.height) * 1000) / 1000,
        src: `files/${info.file}`,
        media_type: 'image',
        position,
        product_id: productId,
        variants: [],
        'attached_to_variant?': false,
        presentation: new BaseDrop('image_presentation', { focal_point: null }),
      },
      { __file: info.file, __url: info.url ?? `/files/${info.file}` },
    );
  }

  /** Image for a fixture base name such as 'demo-fc-home-front' (with or without extension). */
  fixtureImage(name, options = {}) {
    const key = [...this.preview.fixtureImages.keys()].find((k) => k === name || k.replace(/\.\w+$/, '') === name);
    if (!key) return null;
    return this.#imageDrop(key, this.preview.fixtureImages.get(key), options);
  }

  /** Resolves an image_picker value ("shopify://shop_images/x.png"). Unknown files become a visible marker. */
  imageFromReference(value, owner) {
    if (value === null || value === undefined || value === '') return null;
    const name = String(value)
      .replace(/^shopify:\/\/shop_images\//, '')
      .replace(/^shopify:\/\/files\//, '');
    const fixture = this.fixtureImage(name) ?? this.fixtureImage(name.replace(/\.\w+$/, ''));
    if (fixture) return fixture;
    this.gap('image', `${owner}: image "${value}" is not in scripts/preview/fixtures/images; showing a marker image`);
    const info = this.preview.missingImage(name);
    return this.#imageDrop(`missing:${name}`, info, { alt: '' });
  }

  #mediaDrop(image, position) {
    return new BaseDrop(
      'media',
      {
        id: numericId(`media:${image.id}`, 40000000000000),
        media_type: 'image',
        position,
        alt: image.alt,
        aspect_ratio: image.aspect_ratio,
        width: image.width,
        height: image.height,
        preview_image: image,
        src: image.src,
      },
      { __image: image },
    );
  }

  /* ------------------------------------------------------------------------------ metaobjects */

  #field(type, value, display) {
    return new MetafieldDrop(type, value, display);
  }

  #buildMetaobjects() {
    const locale = this.locale;
    this.leagues = new Map(
      Object.entries(LEAGUES).map(([handle, league]) => [
        handle,
        new BaseDrop('metaobject', {
          system: new BaseDrop('metaobject_system', {
            type: 'sw_league',
            handle,
            id: `gid://shopify/Metaobject/${numericId(`league:${handle}`, 282502000000)}`,
            url: null,
          }),
          name: this.#field('single_line_text_field', t(league, locale)),
          slug: this.#field('single_line_text_field', handle),
          sport: this.#field('single_line_text_field', league.sport),
        }),
      ]),
    );
    this.teams = new Map(
      Object.entries(TEAMS).map(([handle, team]) => {
        const leagues = listOf(team.leagues.map((l) => this.leagues.get(l)));
        return [
          handle,
          new BaseDrop('metaobject', {
            system: new BaseDrop('metaobject_system', {
              type: 'sw_team',
              handle,
              id: `gid://shopify/Metaobject/${numericId(`team:${handle}`, 282502500000)}`,
              url: null,
            }),
            name: this.#field('single_line_text_field', t(team.name, locale)),
            short_name: this.#field('single_line_text_field', t(team.short_name, locale)),
            slug: this.#field('single_line_text_field', handle),
            sport: this.#field('single_line_text_field', team.sport),
            leagues: this.#field('list.metaobject_reference', leagues, JSON.stringify(leagues.map((l) => l.system.id))),
            primary_color: this.#field('color', new ColorDrop(team.primary_color), team.primary_color),
          }),
        ];
      }),
    );
    this.sizeCharts = new Map(
      Object.entries(SIZE_CHARTS).map(([handle, chart]) => [
        handle,
        new BaseDrop('metaobject', {
          system: new BaseDrop('metaobject_system', {
            type: 'sw_size_chart',
            handle,
            id: `gid://shopify/Metaobject/${numericId(`chart:${handle}`, 282503000000)}`,
            url: null,
          }),
          name: this.#field('single_line_text_field', t(chart.name, locale)),
          audience: this.#field('single_line_text_field', chart.audience),
          table: this.#field('json', chart.table, JSON.stringify(chart.table)),
          fit_note: this.#field('multi_line_text_field', t(chart.fit_note, locale)),
        }),
      ]),
    );
    const typeMap = (map) =>
      new MapDrop('metaobjects', map, {
        props: {},
        missing: (key, ctx) => {
          this.gap('resource', `metaobject handle "${key}" is not in the preview mock`);
          return null;
        },
      });
    this.metaobjects = new MapDrop(
      'metaobjects',
      new Map([
        ['sw_team', typeMap(this.teams)],
        ['sw_league', typeMap(this.leagues)],
        ['sw_size_chart', typeMap(this.sizeCharts)],
      ]),
    );
  }

  /* -------------------------------------------------------------------------------- products */

  #buildProducts() {
    const locale = this.locale;
    for (const def of PRODUCTS) {
      const drop = this.#productDrop(def, locale);
      this.products.set(def.handle, drop);
    }
    // References between products (counterpart, complements) once every product exists.
    for (const def of PRODUCTS) {
      const drop = this.products.get(def.handle);
      const ns = drop.metafields.sportwear;
      if (def.counterpart) {
        const other = this.products.get(def.counterpart);
        ns.counterpart = this.#field('product_reference', other, `gid://shopify/Product/${other.id}`);
      }
      if (def.complements?.length) {
        const list = listOf(def.complements.map((h) => this.products.get(h)));
        ns.complements = this.#field(
          'list.product_reference',
          list,
          JSON.stringify(list.map((p) => `gid://shopify/Product/${p.id}`)),
        );
      }
    }
  }

  #productDrop(def, locale) {
    const id = numericId(`product:${def.handle}`, 15307595000000);
    const title = t(def.title, locale);
    const url = `${this.root}/products/${def.handle}`;
    const sizes = def.audience === 'kids' ? KIDS_SIZES : ADULT_SIZES;
    const optionName = OPTION_NAME[locale] ?? OPTION_NAME.he;
    const images = ['front', 'back'].map((side, index) => {
      const fixture = this.fixtureImage(`${def.image}-${side}`, {
        alt: `${title} – ${IMAGE_ALT_SUFFIX[side][locale] ?? IMAGE_ALT_SUFFIX[side].he}`,
        id: numericId(`image:${def.handle}:${side}`, 36000000000000),
        position: index + 1,
        productId: id,
      });
      if (!fixture) this.gap('image', `fixture image ${def.image}-${side}.png is missing`);
      return fixture;
    });
    const media = images.filter(Boolean).map((image, index) => this.#mediaDrop(image, index + 1));
    const tags = [
      `sport:${def.sport}`,
      `league:${def.league}`,
      `team:${def.team}`,
      `kit:${def.kit}`,
      'season:2026-27',
      `audience:${def.audience}`,
      'demo',
      ...def.extraTags,
    ];
    const description = descriptionFor(def, locale);

    const selectedVariantId = this.spec.product === def.handle ? Number(this.spec.query?.variant) || null : null;
    const product = new BaseDrop('product', {});
    const variants = sizes.map((size, index) => {
      const available = !(def.soldOut ?? []).includes(size);
      const variantId = numericId(`variant:${def.handle}:${size}`, 56000000000000);
      return new BaseDrop(
        'variant',
        {
          id: variantId,
          title: size,
          name: `${title} - ${size}`,
          public_title: size,
          option1: size,
          option2: null,
          option3: null,
          options: [size],
          price: PRICE,
          compare_at_price: def.compareAt ?? null,
          available,
          inventory_quantity: available ? 5 : 0,
          inventory_management: 'shopify',
          inventory_policy: 'deny',
          sku: `DEMO-${def.key.toUpperCase()}-${size}`,
          barcode: null,
          weight: 250,
          weight_unit: 'kg',
          weight_in_unit: 0.25,
          requires_shipping: true,
          taxable: true,
          url: `${url}?variant=${variantId}`,
          featured_image: null,
          featured_media: null,
          image: null,
          selected: selectedVariantId === variantId,
          matched: true,
          incoming: false,
          next_incoming_date: null,
          unit_price: null,
          unit_price_measurement: null,
          quantity_rule: new BaseDrop('quantity_rule', { min: 1, max: null, increment: 1 }),
          quantity_price_breaks: [],
          selling_plan_allocations: [],
          store_availabilities: [],
          requires_selling_plan: false,
          metafields: emptyMetafields('variant'),
          position: index + 1,
        },
        { product },
      );
    });
    const firstAvailable = variants.find((v) => v.available) ?? null;
    const selected = variants.find((v) => v.id === selectedVariantId) ?? null;
    const current = selected ?? firstAvailable ?? variants[0];
    const optionValues = variants.map(
      (variant) =>
        new OptionValueDrop('product_option_value', {
          id: numericId(`option-value:${def.handle}:${variant.option1}`, 1000000000),
          name: variant.option1,
          available: variant.available,
          selected: variant === current,
          variant,
          swatch: null,
          product_url: null,
        }),
    );
    const option = new BaseDrop('product_option', {
      name: optionName,
      position: 1,
      values: optionValues,
      selected_value: current.option1,
    });
    const compareAt = def.compareAt ?? null;

    const team = this.teams.get(def.team);
    const league = this.leagues.get(def.league);
    const chart = this.sizeCharts.get(def.audience === 'kids' ? 'demo-kids' : 'demo-adult');
    const sportwear = new MetafieldNamespaceDrop(
      'product',
      'sportwear',
      {
        team: team ? this.#field('metaobject_reference', team, team.system.id) : null,
        leagues: league
          ? this.#field('list.metaobject_reference', listOf([league]), JSON.stringify([league.system.id]))
          : null,
        season: this.#field('single_line_text_field', '26/27'),
        kit: this.#field('single_line_text_field', def.kit),
        audience: this.#field('single_line_text_field', def.audience),
        size_chart: chart ? this.#field('metaobject_reference', chart, chart.system.id) : null,
        counterpart: null,
        complements: null,
        source_url: null,
      },
      PRODUCT_METAFIELD_KEYS,
    );

    Object.defineProperties(
      product,
      Object.getOwnPropertyDescriptors({
        id,
        handle: def.handle,
        title,
        url,
        vendor: VENDOR,
        type: def.type,
        tags,
        description,
        content: description,
        available: variants.some((v) => v.available),
        price: PRICE,
        price_min: PRICE,
        price_max: PRICE,
        price_varies: false,
        compare_at_price: compareAt,
        compare_at_price_min: compareAt ?? 0,
        compare_at_price_max: compareAt ?? 0,
        compare_at_price_varies: false,
        variants,
        has_only_default_variant: false,
        options: [optionName],
        options_with_values: [option],
        options_by_name: new MapDrop(
          'options_by_name',
          new Map([
            [optionName, option],
            [optionName.toLowerCase(), option],
          ]),
        ),
        featured_image: images[0] ?? null,
        featured_media: media[0] ?? null,
        media,
        images: images.filter(Boolean),
        first_available_variant: firstAvailable,
        selected_variant: selected,
        selected_or_first_available_variant: current,
        selected_selling_plan: null,
        selected_selling_plan_allocation: null,
        selected_or_first_available_selling_plan_allocation: null,
        requires_selling_plan: false,
        selling_plan_groups: [],
        'quantity_price_breaks_configured?': false,
        'gift_card?': false,
        category: null,
        collections: [],
        created_at: def.createdAt,
        published_at: def.createdAt,
        template_suffix: null,
        object_type: 'product',
        metafields: new MetafieldsDrop('product', { sportwear }),
      }),
    );
    Object.defineProperty(product, '__def', { value: def, enumerable: false });
    Object.defineProperty(product, 'toJSON', { value: () => productJson(product), enumerable: false });
    for (const variant of variants) {
      Object.defineProperty(variant, 'toJSON', { value: () => variantJson(variant), enumerable: false });
    }
    return product;
  }

  product(handle) {
    return this.products.get(handle) ?? null;
  }

  /* ----------------------------------------------------------------------------- collections */

  #buildCollections() {
    const locale = this.locale;
    const all = [...this.products.values()];
    for (const def of COLLECTIONS) {
      let products = all.filter((p) => def.match(p.__def));
      if (def.order) products = def.order.map((h) => this.products.get(h)).filter(Boolean);
      this.collectionsByHandle.set(def.handle, this.#collectionDrop(def, products, locale));
    }
    for (const product of all) {
      product.collections = [...this.collectionsByHandle.values()].filter(
        (c) => c.handle !== 'all' && c.__all.includes(product),
      );
    }
    // Iteration over `collections` excludes the automatic "all" collection, like Shopify.
    const listed = [...this.collectionsByHandle.values()].filter((c) => c.handle !== 'all');
    this.collections = new MapDrop('collections', this.collectionsByHandle, { iterate: listed });
    this.allProducts = new MapDrop('all_products', this.products);
  }

  #collectionDrop(def, allProducts, locale) {
    const handle = def.handle;
    const isCurrent = this.spec.collection === handle;
    const query = isCurrent ? (this.spec.query ?? {}) : {};
    const sortBy = isCurrent && query.sort_by ? String(query.sort_by) : null;
    const defaultSort = handle === 'best-sellers' ? 'best-selling' : 'manual';
    const { filters, filtered } = this.buildFilters(allProducts, query, `${this.root}/collections/${handle}`);
    const sorted = sortProducts(filtered, sortBy ?? defaultSort);
    const url = `${this.root}/collections/${handle}`;
    const drop = new BaseDrop(
      'collection',
      {
        id: numericId(`collection:${handle}`, 512840000000),
        handle,
        title: t(def.title, locale),
        description: t(def.description, locale) ?? '',
        url,
        image: null,
        featured_image: sorted[0]?.featured_image ?? null,
        get products() {
          return windowed(drop, 'products', sorted);
        },
        products_count: sorted.length,
        all_products_count: allProducts.length,
        filters,
        sort_options: this.sortOptions([
          'manual',
          'best-selling',
          'title-ascending',
          'title-descending',
          'price-ascending',
          'price-descending',
          'created-ascending',
          'created-descending',
        ]),
        sort_by: sortBy,
        default_sort_by: defaultSort,
        all_tags: [...new Set(allProducts.flatMap((p) => p.tags))].sort(),
        all_types: [...new Set(allProducts.map((p) => p.type))].sort(),
        all_vendors: [...new Set(allProducts.map((p) => p.vendor))].sort(),
        tags: [],
        current_type: null,
        current_vendor: null,
        template_suffix: null,
        published_at: '2026-09-25T12:00:00+03:00',
        next_product: null,
        previous_product: null,
        metafields: emptyMetafields('collection'),
      },
      { __all: sorted },
    );
    return drop;
  }

  collection(handle) {
    return this.collectionsByHandle.get(handle) ?? null;
  }

  sortOptions(values) {
    return values.map(
      (value) => new BaseDrop('sort_option', { name: t(SYSTEM_STRINGS.sort[value], this.locale), value }),
    );
  }

  /** Storefront filters (availability, price, size, product type) like Shopify's filter objects. */
  buildFilters(products, query, baseUrl) {
    const locale = this.locale;
    const optionName = OPTION_NAME[locale] ?? OPTION_NAME.he;
    const params = Object.entries(query).filter(([key]) => key.startsWith('filter.'));
    const activeValues = (param) =>
      params.filter(([key]) => key === param).flatMap(([, value]) => (Array.isArray(value) ? value : [value]));
    const urlWith = (pairs) => {
      const search = new URLSearchParams();
      for (const [key, value] of pairs) search.append(key, value);
      if (query.q) search.set('q', query.q);
      if (query.sort_by) search.set('sort_by', query.sort_by);
      const text = search.toString();
      return text ? `${baseUrl}?${text}` : baseUrl;
    };
    const flatParams = params.flatMap(([key, value]) => (Array.isArray(value) ? value : [value]).map((v) => [key, v]));

    const listFilter = (label, paramName, entries) => {
      const active = activeValues(paramName);
      const values = entries.map(([value, valueLabel, count]) => {
        const isActive = active.includes(value);
        return new BaseDrop('filter_value', {
          label: valueLabel,
          value,
          count,
          active: isActive,
          param_name: paramName,
          url_to_add: urlWith([...flatParams, [paramName, value]]),
          url_to_remove: urlWith(flatParams.filter(([k, v]) => !(k === paramName && v === value))),
          swatch: null,
          image: null,
        });
      });
      return new BaseDrop('filter', {
        label,
        param_name: paramName,
        type: 'list',
        presentation: 'text',
        operator: 'OR',
        values,
        active_values: values.filter((v) => v.active),
        inactive_values: values.filter((v) => !v.active),
        false_value: null,
        true_value: null,
        min_value: null,
        max_value: null,
        range_max: null,
        url_to_remove: urlWith(flatParams.filter(([k]) => k !== paramName)),
      });
    };

    const sizes = products.some((p) => p.__def.audience === 'kids')
      ? [...(products.some((p) => p.__def.audience !== 'kids') ? ADULT_SIZES : []), ...KIDS_SIZES]
      : ADULT_SIZES;
    const optionParam = `filter.v.option.${handleize(optionName)}`;
    const typeParam = 'filter.p.product_type';
    const availabilityParam = 'filter.v.availability';
    const priceMax = Math.max(0, ...products.map((p) => p.price_max));

    const gte = Number(activeValues('filter.v.price.gte')[0]);
    const lte = Number(activeValues('filter.v.price.lte')[0]);
    const priceFilter = new BaseDrop('filter', {
      label: t(SYSTEM_STRINGS.filters.price, locale),
      param_name: 'filter.v.price',
      type: 'price_range',
      presentation: null,
      operator: null,
      values: [],
      active_values: [],
      inactive_values: [],
      min_value: new BaseDrop('filter_value', {
        param_name: 'filter.v.price.gte',
        value: Number.isFinite(gte) ? gte : null,
        active: Number.isFinite(gte),
        url_to_remove: urlWith(flatParams.filter(([k]) => k !== 'filter.v.price.gte')),
      }),
      max_value: new BaseDrop('filter_value', {
        param_name: 'filter.v.price.lte',
        value: Number.isFinite(lte) ? lte : null,
        active: Number.isFinite(lte),
        url_to_remove: urlWith(flatParams.filter(([k]) => k !== 'filter.v.price.lte')),
      }),
      range_max: priceMax,
      url_to_remove: urlWith(flatParams.filter(([k]) => !k.startsWith('filter.v.price'))),
    });

    const filters = [
      listFilter(t(SYSTEM_STRINGS.filters.availability, locale), availabilityParam, [
        ['1', t(SYSTEM_STRINGS.filters.in_stock, locale), products.filter((p) => p.available).length],
        ['0', t(SYSTEM_STRINGS.filters.out_of_stock, locale), products.filter((p) => !p.available).length],
      ]),
      priceFilter,
      listFilter(
        optionName,
        optionParam,
        sizes.map((size) => [
          size,
          size,
          products.filter((p) => p.variants.some((v) => v.option1 === size && v.available)).length,
        ]),
      ),
      listFilter(
        t(SYSTEM_STRINGS.filters.product_type, locale),
        typeParam,
        [...new Set(products.map((p) => p.type))].map((type) => [
          type,
          t(PRODUCT_TYPES[type], locale) ?? type,
          products.filter((p) => p.type === type).length,
        ]),
      ),
    ];

    let filtered = products;
    const availability = activeValues(availabilityParam);
    if (availability.length) filtered = filtered.filter((p) => availability.includes(p.available ? '1' : '0'));
    const size = activeValues(optionParam);
    if (size.length) filtered = filtered.filter((p) => p.variants.some((v) => size.includes(v.option1) && v.available));
    const types = activeValues(typeParam);
    if (types.length) filtered = filtered.filter((p) => types.includes(p.type));
    if (Number.isFinite(gte)) filtered = filtered.filter((p) => p.price_max >= gte * 100);
    if (Number.isFinite(lte)) filtered = filtered.filter((p) => p.price_min <= lte * 100);
    return { filters, filtered };
  }

  /* ---------------------------------------------------------------------------- pages, blog */

  #buildPages() {
    for (const def of PAGES) {
      this.pagesByHandle.set(
        def.handle,
        new BaseDrop('page', {
          id: numericId(`page:${def.handle}`, 162268000000),
          handle: def.handle,
          title: t(def.title, this.locale),
          content: t(def.content, this.locale),
          url: `${this.root}/pages/${def.handle}`,
          author: 'SportWear',
          published_at: '2026-09-25T12:00:00+03:00',
          template_suffix: null,
          metafields: emptyMetafields('page'),
        }),
      );
    }
    this.pages = new MapDrop('pages', this.pagesByHandle);
  }

  page(handle) {
    return this.pagesByHandle.get(handle) ?? null;
  }

  #buildBlog() {
    const locale = this.locale;
    const blogUrl = `${this.root}/blogs/${BLOG.handle}`;
    const articles = BLOG.articles.map((def) => {
      const content = t(def.content, locale);
      return new BaseDrop('article', {
        id: numericId(`article:${def.handle}`, 600000000000),
        handle: `${BLOG.handle}/${def.handle}`,
        title: t(def.title, locale),
        author: def.author,
        content,
        excerpt: '',
        excerpt_or_content: content,
        url: `${blogUrl}/${def.handle}`,
        image: this.fixtureImage(def.image, { alt: t(def.title, locale) }),
        published_at: def.publishedAt,
        created_at: def.publishedAt,
        updated_at: def.publishedAt,
        tags: def.tags,
        comments: [],
        comments_count: 0,
        'comments_enabled?': false,
        comment_post_url: `${blogUrl}/${def.handle}/comments`,
        'moderated?': false,
        user: new BaseDrop('user', {
          name: def.author,
          first_name: def.author,
          last_name: '',
          bio: null,
          email: null,
          image: null,
          homepage: null,
          account_owner: false,
        }),
        template_suffix: null,
        metafields: emptyMetafields('article'),
      });
    });
    const blog = new BaseDrop('blog', {
      id: numericId(`blog:${BLOG.handle}`, 90000000000),
      handle: BLOG.handle,
      title: t(BLOG.title, locale),
      url: blogUrl,
      get articles() {
        return windowed(blog, 'articles', articles);
      },
      articles_count: articles.length,
      all_tags: [...new Set(articles.flatMap((a) => a.tags))],
      tags: [],
      'comments_enabled?': false,
      'moderated?': false,
      next_article: null,
      previous_article: null,
      template_suffix: null,
      metafields: emptyMetafields('blog'),
    });
    this.blog = blog;
    this.articlesByHandle = new Map(articles.map((a) => [a.handle, a]));
    this.blogs = new MapDrop('blogs', new Map([[BLOG.handle, blog]]));
    this.articles = new MapDrop('articles', this.articlesByHandle);
  }

  /* ------------------------------------------------------------------------ localization etc. */

  #buildLocalization() {
    const locale = this.locale;
    this.currency = new ValueDrop('currency', SHOP.currency, {
      iso_code: SHOP.currency,
      name: t(SHOP.currency_name, locale),
      symbol: SHOP.currency_symbol,
    });
    this.shopLocales = LOCALES.map(
      (l) =>
        new BaseDrop('shop_locale', {
          iso_code: l.iso_code,
          name: l.name,
          endonym_name: l.endonym_name,
          primary: l.primary,
          root_url: l.primary ? '/' : `/${l.iso_code}`,
          direction: l.direction,
        }),
    );
    this.shopLocale = this.shopLocales.find((l) => l.iso_code === locale);
    const market = new BaseDrop('market', { id: 5000000001, handle: 'il', metafields: emptyMetafields('market') });
    this.country = new ValueDrop('country', t(COUNTRY.name, locale), {
      iso_code: COUNTRY.iso_code,
      name: t(COUNTRY.name, locale),
      currency: this.currency,
      unit_system: COUNTRY.unit_system,
      available_languages: this.shopLocales,
      market,
      popular: true,
      continent: 'Asia',
    });
    this.localization = new BaseDrop('localization', {
      available_countries: [this.country],
      available_languages: this.shopLocales,
      country: this.country,
      language: this.shopLocale,
      market,
    });
    const r = this.root;
    this.routes = new BaseDrop('routes', {
      root_url: r || '/',
      account_url: `${r}/account`,
      account_login_url: `${r}/account/login`,
      account_logout_url: `${r}/account/logout`,
      account_recover_url: `${r}/account/recover`,
      account_register_url: `${r}/account/register`,
      account_addresses_url: `${r}/account/addresses`,
      collections_url: `${r}/collections`,
      all_products_collection_url: `${r}/collections/all`,
      search_url: `${r}/search`,
      predictive_search_url: `${r}/search/suggest`,
      cart_url: `${r}/cart`,
      cart_add_url: `${r}/cart/add`,
      cart_change_url: `${r}/cart/change`,
      cart_clear_url: `${r}/cart/clear`,
      cart_update_url: `${r}/cart/update`,
      product_recommendations_url: `${r}/recommendations/products`,
    });
    this.policies = POLICIES.map(
      (p) =>
        new BaseDrop('policy', {
          id: numericId(`policy:${p.handle}`, 3000000000),
          title: t(p.title, locale),
          body: `<p>${escapeHtml(t(p.title, locale))}</p>`,
          url: `${r}/policies/${p.handle}`,
        }),
    );
    const policy = (handle) => this.policies[POLICIES.findIndex((p) => p.handle === handle)];
    this.shop = new BaseDrop('shop', {
      id: 90000000001,
      name: SHOP.name,
      email: SHOP.email,
      description: null,
      domain: SHOP.domain,
      permanent_domain: SHOP.domain,
      url: SHOP.url,
      secure_url: SHOP.url,
      currency: SHOP.currency,
      money_format: this.moneyFormat,
      money_with_currency_format: this.moneyWithCurrencyFormat,
      enabled_currencies: [this.currency],
      enabled_payment_types: SHOP.enabled_payment_types,
      locale: this.locale,
      published_locales: this.shopLocales,
      customer_accounts_enabled: SHOP.customer_accounts !== 'disabled',
      customer_accounts_optional: SHOP.customer_accounts === 'optional',
      accepts_gift_cards: true,
      taxes_included: SHOP.taxes_included,
      password_message: null,
      phone: null,
      address: new BaseDrop('address', {
        address1: null,
        address2: null,
        city: null,
        company: SHOP.name,
        country: t(COUNTRY.name, locale),
        country_code: COUNTRY.iso_code,
        province: null,
        province_code: null,
        zip: null,
        summary: t(COUNTRY.name, locale),
      }),
      policies: this.policies,
      privacy_policy: policy('privacy-policy'),
      refund_policy: policy('refund-policy'),
      shipping_policy: policy('shipping-policy'),
      terms_of_service: policy('terms-of-service'),
      subscription_policy: null,
      brand: new BaseDrop('brand', {
        logo: null,
        square_logo: null,
        colors: null,
        cover_image: null,
        short_description: null,
        slogan: null,
        metafields: emptyMetafields('brand'),
      }),
      products_count: this.products.size,
      collections_count: this.collectionsByHandle.size - 1,
      types: [...new Set([...this.products.values()].map((p) => p.type))],
      vendors: [VENDOR],
      metafields: emptyMetafields('shop'),
    });
  }

  /* ------------------------------------------------------------------------------------ cart */

  buildCart(lines) {
    const items = [];
    for (const [index, line] of (lines ?? []).entries()) {
      const product = this.products.get(line.handle);
      if (!product) continue;
      const variant =
        product.variants.find((v) => v.option1 === line.size || v.id === line.variantId) ?? product.variants[0];
      const quantity = Math.max(1, Number(line.quantity) || 1);
      const optionName = product.options[0];
      items.push(
        new BaseDrop(
          'line_item',
          {
            id: variant.id,
            key: `${variant.id}:${shortHash(`${variant.id}:${index}`, 32)}`,
            quantity,
            variant,
            variant_id: variant.id,
            product,
            product_id: product.id,
            title: `${product.title} - ${variant.title}`,
            url: variant.url,
            url_to_remove: `${this.root}/cart/change?line=${index + 1}&quantity=0`,
            error_message: null,
            grams: 250,
            fulfillment_service: 'manual',
            image: variant.featured_image ?? product.featured_image,
            sku: variant.sku,
            vendor: product.vendor,
            price: variant.price,
            original_price: variant.price,
            final_price: variant.price,
            line_price: variant.price * quantity,
            original_line_price: variant.price * quantity,
            final_line_price: variant.price * quantity,
            discounts: [],
            discount_allocations: [],
            line_level_discount_allocations: [],
            line_level_total_discount: 0,
            total_discount: 0,
            options_with_values: [new BaseDrop('line_item_option', { name: optionName, value: variant.title })],
            properties: {},
            requires_shipping: true,
            taxable: true,
            gift_card: false,
            message: null,
            selling_plan_allocation: null,
            unit_price: null,
            unit_price_measurement: null,
            item_components: [],
            fulfillment: null,
            successfully_fulfilled_quantity: 0,
          },
          {},
        ),
      );
    }
    const total = items.reduce((sum, item) => sum + item.final_line_price, 0);
    const cart = new BaseDrop('cart', {
      items,
      item_count: items.reduce((sum, item) => sum + item.quantity, 0),
      items_subtotal_price: total,
      total_price: total,
      original_total_price: total,
      checkout_charge_amount: total,
      total_discount: 0,
      total_weight: items.reduce((sum, item) => sum + item.quantity * 250, 0),
      note: null,
      attributes: {},
      currency: this.currency,
      'empty?': items.length === 0,
      requires_shipping: items.length > 0,
      taxes_included: SHOP.taxes_included,
      duties_included: false,
      discount_applications: [],
      cart_level_discount_applications: [],
    });
    Object.defineProperty(cart, 'toJSON', { value: () => cartJson(cart), enumerable: false });
    return cart;
  }

  /* ----------------------------------------------------------------------------------- menus */

  #buildMenu(handle) {
    const menu = MENUS[handle];
    const links = menu.links.map((def) => this.#buildLink(def));
    const depth = (list) => (list.length ? 1 + Math.max(...list.map((l) => depth(l.links))) : 0);
    return new BaseDrop('linklist', {
      handle,
      title: t(menu.title, this.locale),
      links,
      levels: depth(links),
    });
  }

  #buildLink(def) {
    const locale = this.locale;
    const r = this.root;
    let url = r || '/';
    let object = null;
    switch (def.type) {
      case 'collection_link':
        url = `${r}/collections/${def.target}`;
        object = this.collection(def.target);
        break;
      case 'page_link':
        url = `${r}/pages/${def.target}`;
        object = this.page(def.target);
        break;
      case 'search_link':
        url = `${r}/search`;
        break;
      case 'catalog_link':
        url = `${r}/collections/all`;
        break;
      case 'product_link':
        url = `${r}/products/${def.target}`;
        object = this.product(def.target);
        break;
      default:
        break;
    }
    const children = def.links.map((child) => this.#buildLink(child));
    const current = this.requestPath === url;
    const productInCollection =
      def.type === 'collection_link' && this.spec.product && object?.__all?.some((p) => p.handle === this.spec.product);
    const childCurrent = children.some((c) => c.current || c.child_current);
    const childActive = children.some((c) => c.active || c.child_active);
    const depth = (list) => (list.length ? 1 + Math.max(...list.map((l) => depth(l.links))) : 0);
    return new BaseDrop('link', {
      title: t(def.title, locale),
      url,
      type: def.type,
      object,
      handle: handleize(t(def.title, 'en')),
      current,
      active: current || Boolean(productInCollection) || this.requestPath.startsWith(`${url}/`),
      child_current: childCurrent,
      child_active: childActive,
      links: children,
      levels: depth(children),
    });
  }

  linklist(handle) {
    return this.linklistsByHandle.get(handle) ?? null;
  }

  /* -------------------------------------------------------------------------------- settings */

  colorScheme(id) {
    return this.colorSchemes?.get(id) ?? null;
  }

  #buildThemeSettings() {
    const { schema, data } = this.preview.themeSettings;
    const definitions = schema.flatMap((group) => group.settings ?? []).filter((s) => s.id);
    const groupDef = definitions.find((s) => s.type === 'color_scheme_group');
    this.colorSchemes = new Map();
    if (groupDef) {
      const raw = data.color_schemes ?? {};
      for (const [id, scheme] of Object.entries(raw)) {
        const values = {};
        for (const field of groupDef.definition ?? []) {
          const value = scheme.settings?.[field.id] ?? field.default ?? null;
          values[field.id] =
            field.type === 'color'
              ? value
                ? new ColorDrop(value)
                : null
              : field.type === 'color_background'
                ? (value ?? '')
                : value;
        }
        this.colorSchemes.set(id, new ColorSchemeDrop(id, new SettingsDrop(`color scheme ${id}`, values)));
      }
    }
    const values = {};
    for (const def of definitions) {
      if (def.type === 'color_scheme_group') {
        values[def.id] = new MapDrop('color_schemes', this.colorSchemes);
        continue;
      }
      values[def.id] = this.resolveSetting(def, data[def.id], 'config/settings_schema.json');
    }
    return new SettingsDrop('theme settings (config/settings_schema.json)', values);
  }

  /**
   * Resolves one setting value the way Shopify hands it to Liquid.
   * @param {object} def - schema setting definition
   * @param {any} raw - value from JSON (undefined = not set)
   * @param {string} owner - for gap messages
   * @param {(expr: string) => any} [evaluate] - evaluates dynamic sources ("{{ closest.product }}")
   */
  resolveSetting(def, raw, owner, evaluate) {
    let value = raw === undefined ? def.default : raw;
    if (typeof value === 'string' && value.includes('{{') && evaluate) {
      const exact = value.match(/^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/);
      if (exact && !['text', 'textarea', 'richtext', 'inline_richtext', 'html'].includes(def.type)) {
        return evaluate(exact[1], true) ?? null;
      }
      value = evaluate(value, false);
    }
    switch (def.type) {
      case 'checkbox':
        return value === undefined || value === null ? false : Boolean(value);
      case 'range':
      case 'number':
        return value === undefined || value === null || value === '' ? null : Number(value);
      case 'color':
        return value ? new ColorDrop(value) : null;
      case 'color_background':
        return value ?? '';
      case 'color_scheme': {
        if (!value) return null;
        const scheme = this.colorScheme(value);
        if (!scheme) this.gap('resource', `${owner}: color scheme "${value}" is not defined in settings_data.json`);
        return scheme;
      }
      case 'image_picker':
        return this.imageFromReference(value, `${owner} setting "${def.id}"`);
      case 'collection':
        return this.#resource('collection', value, owner);
      case 'product':
        return this.#resource('product', value, owner);
      case 'page':
        return this.#resource('page', value, owner);
      case 'blog':
        return value ? (value === BLOG.handle ? this.blog : this.#missingResource('blog', value, owner)) : null;
      case 'article':
        return value ? (this.articlesByHandle.get(value) ?? this.#missingResource('article', value, owner)) : null;
      case 'link_list':
        return this.#resource('linklist', value, owner);
      case 'collection_list':
        return listOf((value ?? []).map((h) => this.#resource('collection', h, owner)).filter(Boolean));
      case 'product_list':
        return listOf((value ?? []).map((h) => this.#resource('product', h, owner)).filter(Boolean));
      case 'url':
        return this.resolveUrl(value);
      case 'video_url':
        return value ? this.#videoUrl(value) : null;
      case 'video':
        if (value) this.gap('unsupported', `${owner}: video setting "${def.id}" is not emulated (rendered as nil)`);
        return null;
      case 'font_picker':
        return value ? this.#fontDrop(value) : null;
      case 'metaobject':
      case 'metaobject_list':
        if (value)
          this.gap('unsupported', `${owner}: ${def.type} setting "${def.id}" is not emulated (rendered as nil)`);
        return def.type === 'metaobject_list' ? [] : null;
      case 'liquid':
        if (value) this.gap('unsupported', `${owner}: liquid setting "${def.id}" is output as raw text`);
        return value ?? '';
      case 'text':
      case 'textarea':
      case 'richtext':
      case 'inline_richtext':
      case 'html':
      case 'select':
      case 'radio':
      case 'text_alignment':
        return value ?? null;
      default:
        return value ?? null;
    }
  }

  #resource(kind, handle, owner) {
    if (handle === undefined || handle === null || handle === '') return null;
    if (handle instanceof BaseDrop) return handle;
    const found =
      kind === 'collection'
        ? this.collection(handle)
        : kind === 'product'
          ? this.product(handle)
          : kind === 'page'
            ? this.page(handle)
            : this.linklist(handle);
    return found ?? this.#missingResource(kind, handle, owner);
  }

  #missingResource(kind, handle, owner) {
    this.gap('resource', `${owner}: ${kind} "${handle}" is not in the preview mock (rendered as nil)`);
    return null;
  }

  #videoUrl(value) {
    const url = String(value);
    const youtube = url.match(/(?:youtu\.be\/|v=)([\w-]{6,})/);
    const vimeo = url.match(/vimeo\.com\/(\d+)/);
    return new ValueDrop('video_url', url, {
      id: youtube?.[1] ?? vimeo?.[1] ?? null,
      type: youtube ? 'youtube' : vimeo ? 'vimeo' : null,
    });
  }

  #fontDrop(value) {
    const [family = 'sans-serif', variant = 'n4'] = String(value).split('_');
    return new ValueDrop('font', family, {
      family,
      fallback_families: 'sans-serif',
      style: variant.startsWith('i') ? 'italic' : 'normal',
      weight: Number(variant.slice(1)) * 100 || 400,
      variants: [],
      system: true,
    });
  }

  /** shopify:// URLs from url settings become storefront paths. */
  resolveUrl(value) {
    if (value === undefined || value === null || value === '') return null;
    const text = String(value);
    const match = text.match(/^shopify:\/\/(\w+)(?:\/(.*))?$/);
    if (!match) return text;
    const [, kind, rest = ''] = match;
    const r = this.root;
    switch (kind) {
      case 'collections':
        return rest ? `${r}/collections/${rest}` : `${r}/collections`;
      case 'products':
        return `${r}/products/${rest}`;
      case 'pages':
        return `${r}/pages/${rest}`;
      case 'blogs':
        return `${r}/blogs/${rest}`;
      case 'policies':
        return `${r}/policies/${rest}`;
      case 'search':
        return `${r}/search`;
      default:
        return `${r}/${kind}${rest ? `/${rest}` : ''}`;
    }
  }

  /* ------------------------------------------------------------------------------- globals */

  /** The Liquid globals for this page (template-specific objects included). */
  buildGlobals(extra = {}) {
    const spec = this.spec;
    const locale = this.locale;
    const product = spec.product ? this.product(spec.product) : null;
    const collection = spec.collection ? this.collection(spec.collection) : null;
    const page = spec.page ? this.page(spec.page) : null;
    const article = spec.article ? (this.articlesByHandle.get(`${BLOG.handle}/${spec.article}`) ?? null) : null;
    const blog = spec.blog || article ? this.blog : null;
    const search = spec.template === 'search' ? this.buildSearch(spec.query?.q ?? '') : null;

    let pageTitle = this.shop.name;
    let pageDescription = null;
    let handle = null;
    switch (spec.pageType) {
      case 'product':
        pageTitle = product?.title ?? pageTitle;
        pageDescription = product ? stripHtml(product.description).trim().slice(0, 160) : null;
        handle = product?.handle ?? null;
        break;
      case 'collection':
        pageTitle = collection?.title ?? pageTitle;
        pageDescription = collection ? stripHtml(collection.description).trim() || null : null;
        handle = collection?.handle ?? null;
        break;
      case 'page':
        pageTitle = page?.title ?? pageTitle;
        handle = page?.handle ?? null;
        break;
      case 'blog':
        pageTitle = blog?.title ?? pageTitle;
        handle = blog?.handle ?? null;
        break;
      case 'article':
        pageTitle = article?.title ?? pageTitle;
        handle = article?.handle ?? null;
        break;
      case 'cart':
        pageTitle = t(SYSTEM_STRINGS.titles.cart, locale);
        break;
      case 'search':
        pageTitle = search?.performed
          ? `${t(SYSTEM_STRINGS.titles.search, locale)}: ${search.terms}`
          : t(SYSTEM_STRINGS.titles.search, locale);
        break;
      case '404':
        pageTitle = t(SYSTEM_STRINGS.titles.not_found, locale);
        break;
      case 'list-collections':
        pageTitle = t(SYSTEM_STRINGS.titles.collections, locale);
        break;
      case 'password':
        pageTitle = t(SYSTEM_STRINGS.titles.password, locale);
        break;
      default:
        break;
    }

    const templateName = spec.suffix ? `${spec.template}.${spec.suffix}` : spec.template;
    const globals = {
      settings: this.settings,
      shop: this.shop,
      request: new BaseDrop('request', {
        design_mode: false,
        visual_preview_mode: false,
        host: SHOP.domain,
        origin: SHOP.url,
        path: this.requestPath,
        page_type: spec.pageType,
        locale: this.shopLocale,
      }),
      routes: this.routes,
      localization: this.localization,
      linklists: this.linklists,
      collections: this.collections,
      all_products: this.allProducts,
      pages: this.pages,
      blogs: this.blogs,
      articles: this.articles,
      images: new MapDrop('images', this.images),
      metaobjects: this.metaobjects,
      cart: this.cart,
      customer: null,
      recommendations: this.buildRecommendations(null),
      predictive_search: this.buildPredictiveSearch(null),
      template: new ValueDrop('template', templateName, {
        name: spec.template,
        suffix: spec.suffix ?? null,
        directory: null,
      }),
      page_title: pageTitle,
      page_description: pageDescription,
      page_image: product?.featured_image ?? null,
      canonical_url: `${SHOP.url}${this.requestPath === '/' ? '' : this.requestPath}` || SHOP.url,
      handle,
      current_tags: null,
      current_page: Number(spec.query?.page) || 1,
      content_for_header: CONTENT_FOR_HEADER_PLACEHOLDER,
      content_for_layout: '',
      content_for_index: '',
      content_for_additional_checkout_buttons: '',
      additional_checkout_buttons: false,
      powered_by_link: `<a target="_blank" rel="nofollow" href="https://www.shopify.com?utm_campaign=poweredby&amp;utm_medium=shopify&amp;utm_source=onlinestore">${escapeHtml(t(SYSTEM_STRINGS.powered_by, locale))}</a>`,
      country_option_tags: `<option value="Israel" data-provinces="[]">${escapeHtml(t(COUNTRY.name, locale))}</option>`,
      all_country_option_tags: `<option value="Israel" data-provinces="[]">${escapeHtml(t(COUNTRY.name, locale))}</option>`,
      scripts: null,
      theme: new BaseDrop('theme', { id: 1, name: 'SportWear (preview)', role: 'unpublished' }),
      product,
      collection,
      page,
      blog,
      article,
      search,
      gift_card: spec.template === 'gift_card' ? this.buildGiftCard() : null,
      ...extra,
    };
    return globals;
  }

  buildSearch(terms) {
    const q = String(terms ?? '').trim();
    const needle = q.toLowerCase();
    const matches = (text) =>
      String(text ?? '')
        .toLowerCase()
        .includes(needle);
    const products = q
      ? PRODUCTS.filter(
          (def) => Object.values(def.title).some(matches) || def.extraTags.some(matches) || matches(def.handle),
        ).map((def) => this.products.get(def.handle))
      : [];
    const query = this.spec.query ?? {};
    const { filters, filtered } = this.buildFilters(products, query, `${this.root}/search`);
    const sortBy = query.sort_by ? String(query.sort_by) : 'relevance';
    const results = sortProducts(filtered, sortBy);
    const drop = new BaseDrop('search', {
      performed: Boolean(q),
      terms: q,
      get results() {
        return windowed(drop, 'results', results);
      },
      results_count: results.length,
      types: ['product', 'page', 'article'],
      filters,
      sort_by: sortBy,
      default_sort_by: 'relevance',
      sort_options: this.sortOptions(['relevance', 'price-ascending', 'price-descending']),
    });
    return drop;
  }

  buildRecommendations(product, intent = 'related', limit = 4) {
    if (!product) {
      return new BaseDrop('recommendations', {
        performed: false,
        'performed?': false,
        products: [],
        products_count: 0,
        intent,
      });
    }
    let products;
    if (intent === 'complementary') {
      products = product.metafields.sportwear.complements?.value ?? [];
    } else {
      const sport = product.__def.sport;
      products = [...this.products.values()].filter((p) => p !== product && p.__def.sport === sport);
    }
    products = products.slice(0, limit);
    return new BaseDrop('recommendations', {
      performed: true,
      'performed?': true,
      products,
      products_count: products.length,
      intent,
    });
  }

  buildPredictiveSearch(terms, limit = 4) {
    if (terms === null || terms === undefined) {
      return new BaseDrop('predictive_search', {
        performed: false,
        terms: '',
        types: [],
        resources: new BaseDrop('predictive_search_resources', {
          products: [],
          collections: [],
          pages: [],
          articles: [],
          queries: [],
        }),
      });
    }
    const q = String(terms).trim().toLowerCase();
    const matches = (text) =>
      String(text ?? '')
        .toLowerCase()
        .includes(q);
    const products = PRODUCTS.filter((def) => Object.values(def.title).some(matches))
      .map((def) => this.products.get(def.handle))
      .slice(0, limit);
    const collections = [...this.collectionsByHandle.values()]
      .filter((c) => c.handle !== 'all' && matches(c.title))
      .slice(0, limit);
    const pages = [...this.pagesByHandle.values()].filter((p) => matches(p.title)).slice(0, limit);
    const queries = products.slice(0, 2).map(
      (p) =>
        new BaseDrop('predictive_search_query', {
          text: p.title,
          styled_text: escapeHtml(p.title),
          url: `${this.root}/search?q=${encodeURIComponent(p.title)}`,
        }),
    );
    return new BaseDrop('predictive_search', {
      performed: true,
      terms: String(terms),
      types: ['product', 'collection', 'page', 'query'],
      resources: new BaseDrop('predictive_search_resources', {
        products,
        collections,
        pages,
        articles: [],
        queries,
      }),
    });
  }

  buildGiftCard() {
    return new BaseDrop('gift_card', {
      balance: 20000,
      initial_value: 20000,
      code: 'DEMO XXXX XXXX 1234',
      last_four_characters: '1234',
      currency: SHOP.currency,
      enabled: true,
      expired: false,
      expires_on: null,
      customer: null,
      product: null,
      properties: {},
      qr_identifier: 'DEMOGIFTCARD1234',
      pass_url: null,
      send_on: null,
      message: null,
      recipient: null,
      template_suffix: null,
      url: `${this.root}/gift_cards/demo`,
    });
  }

  /** Wraps globals so reads of unmocked Shopify objects are reported. */
  wrapGlobals(globals) {
    const gap = this.gap;
    return new Proxy(globals, {
      getOwnPropertyDescriptor(target, key) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
        if (!descriptor && typeof key === 'string' && UNMOCKED_GLOBALS.has(key)) {
          gap('object', `the Shopify object "${key}" is not mocked by the preview (rendered as nil)`);
        }
        return descriptor;
      },
    });
  }
}

/* ---------------------------------------------------------------------------------- helpers */

function sortProducts(products, sortBy) {
  const list = [...products];
  switch (sortBy) {
    case 'title-ascending':
      return list.sort((a, b) => a.title.localeCompare(b.title));
    case 'title-descending':
      return list.sort((a, b) => b.title.localeCompare(a.title));
    case 'price-ascending':
      return list.sort((a, b) => a.price - b.price);
    case 'price-descending':
      return list.sort((a, b) => b.price - a.price);
    case 'created-ascending':
      return list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    case 'created-descending':
      return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    default:
      return list;
  }
}

function imageJson(image) {
  if (!image) return null;
  return {
    alt: image.alt,
    id: image.id,
    position: image.position,
    product_id: image.product_id,
    src: image.__url,
    width: image.width,
    height: image.height,
    aspect_ratio: image.aspect_ratio,
    variant_ids: [],
  };
}

function variantJson(variant) {
  return {
    id: variant.id,
    title: variant.title,
    option1: variant.option1,
    option2: null,
    option3: null,
    sku: variant.sku,
    requires_shipping: true,
    taxable: true,
    featured_image: null,
    available: variant.available,
    name: variant.name,
    public_title: variant.public_title,
    options: variant.options,
    price: variant.price,
    weight: variant.weight,
    compare_at_price: variant.compare_at_price,
    inventory_management: variant.inventory_management,
    barcode: variant.barcode,
    featured_media: null,
    requires_selling_plan: false,
    selling_plan_allocations: [],
    quantity_rule: { min: 1, max: null, increment: 1 },
  };
}

export function productJson(product) {
  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    description: product.description,
    published_at: product.published_at,
    created_at: product.created_at,
    vendor: product.vendor,
    type: product.type,
    tags: product.tags,
    price: product.price,
    price_min: product.price_min,
    price_max: product.price_max,
    available: product.available,
    price_varies: product.price_varies,
    compare_at_price: product.compare_at_price,
    compare_at_price_min: product.compare_at_price_min,
    compare_at_price_max: product.compare_at_price_max,
    compare_at_price_varies: product.compare_at_price_varies,
    variants: product.variants.map(variantJson),
    images: product.images.map((i) => i.__url),
    featured_image: product.featured_image?.__url ?? null,
    options: product.options,
    media: product.media.map((m) => ({
      alt: m.alt,
      id: m.id,
      position: m.position,
      preview_image: { aspect_ratio: m.aspect_ratio, height: m.height, width: m.width, src: m.preview_image.__url },
      aspect_ratio: m.aspect_ratio,
      height: m.height,
      media_type: 'image',
      src: m.preview_image.__url,
      width: m.width,
    })),
    requires_selling_plan: false,
    selling_plan_groups: [],
    content: product.description,
  };
}

export function cartJson(cart) {
  return {
    token: 'preview-cart-token',
    note: cart.note,
    attributes: {},
    original_total_price: cart.original_total_price,
    total_price: cart.total_price,
    total_discount: 0,
    total_weight: cart.total_weight,
    item_count: cart.item_count,
    items: cart.items.map((item) => ({
      id: item.id,
      properties: {},
      quantity: item.quantity,
      variant_id: item.variant_id,
      key: item.key,
      title: item.title,
      price: item.price,
      original_price: item.original_price,
      presentment_price: item.price / 100,
      discounted_price: item.final_price,
      line_price: item.line_price,
      original_line_price: item.original_line_price,
      total_discount: 0,
      discounts: [],
      sku: item.sku,
      grams: 250,
      vendor: item.vendor,
      taxable: true,
      product_id: item.product_id,
      product_has_only_default_variant: false,
      gift_card: false,
      final_price: item.final_price,
      final_line_price: item.final_line_price,
      url: item.url,
      featured_image: imageJson(item.image),
      image: item.image?.__url ?? null,
      handle: item.product.handle,
      requires_shipping: true,
      product_type: item.product.type,
      product_title: item.product.title,
      product_description: stripHtml(item.product.description),
      variant_title: item.variant.title,
      variant_options: item.variant.options,
      options_with_values: item.options_with_values.map((o) => ({ name: o.name, value: o.value })),
      line_level_discount_allocations: [],
      line_level_total_discount: 0,
      quantity_rule: { min: 1, max: null, increment: 1 },
      has_components: false,
    })),
    requires_shipping: cart.requires_shipping,
    currency: SHOP.currency,
    items_subtotal_price: cart.items_subtotal_price,
    cart_level_discount_applications: [],
  };
}

export { CART_LINES };
