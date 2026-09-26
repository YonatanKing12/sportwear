// Mock catalog for the preview harness. Mirrors the demo products created in the store
// (catalog/store-setup.json, tag `demo`) and the store's collections, pages and menus, plus two
// preview-only products that carry the supplier jerseyxie's size charts (catalog/size-charts/jerseyxie.json).
// Hebrew is the store's primary language; English and Arabic are the translations the catalog
// translator will publish. Everything here is fixture data for screenshots only.
import { readFileSync } from 'node:fs';

/** The supplier's transcribed size charts (owner decision, 2026-09-26: its products use them). */
const JERSEYXIE = JSON.parse(
  readFileSync(new URL('../../../catalog/size-charts/jerseyxie.json', import.meta.url), 'utf8'),
);

/** Shop facts read from the Admin API on 2026-09-26 (shop.currencyFormats etc.). */
export const SHOP = {
  name: 'SportWear',
  domain: 'sfgzdp-1m.myshopify.com',
  url: 'https://sfgzdp-1m.myshopify.com',
  currency: 'ILS',
  currency_symbol: '₪',
  currency_name: { he: 'שקל חדש', en: 'Israeli New Shekel', ar: 'شيكل إسرائيلي جديد' },
  // The store's real formats. The theme's price snippet assumes a ₪ symbol; pass
  // --money-format to render with another format (see README).
  money_format: '{{amount}} NIS',
  money_with_currency_format: '{{amount}} ILS',
  timezone: 'Asia/Jerusalem',
  taxes_included: true,
  customer_accounts: 'optional',
  enabled_payment_types: ['visa', 'master', 'american_express', 'apple_pay', 'google_pay'],
  email: 'support@example.com',
};

export const LOCALES = [
  { iso_code: 'he', name: 'Hebrew', endonym_name: 'עברית', direction: 'rtl', primary: true },
  { iso_code: 'en', name: 'English', endonym_name: 'English', direction: 'ltr', primary: false },
  { iso_code: 'ar', name: 'Arabic', endonym_name: 'العربية', direction: 'rtl', primary: false },
];

export const COUNTRY = {
  iso_code: 'IL',
  name: { he: 'ישראל', en: 'Israel', ar: 'إسرائيل' },
  unit_system: 'metric',
};

export const LEAGUES = {
  'premier-league': { sport: 'football', he: 'פרמייר ליג', en: 'Premier League', ar: 'الدوري الإنجليزي الممتاز' },
  'la-liga': { sport: 'football', he: 'לה ליגה', en: 'LaLiga', ar: 'الدوري الإسباني' },
  'serie-a': { sport: 'football', he: 'סרייה A', en: 'Serie A', ar: 'الدوري الإيطالي' },
  bundesliga: { sport: 'football', he: 'בונדסליגה', en: 'Bundesliga', ar: 'الدوري الألماني' },
  'ligue-1': { sport: 'football', he: 'ליג 1', en: 'Ligue 1', ar: 'الدوري الفرنسي' },
  'israeli-premier-league': {
    sport: 'football',
    he: 'ליגת העל',
    en: 'Israeli Premier League',
    ar: 'الدوري الإسرائيلي الممتاز',
  },
  'national-teams': { sport: 'football', he: 'נבחרות', en: 'National Teams', ar: 'المنتخبات' },
  nba: { sport: 'basketball', he: 'NBA', en: 'NBA', ar: 'NBA' },
  euroleague: { sport: 'basketball', he: 'יורוליג', en: 'EuroLeague', ar: 'اليوروليغ' },
  'israeli-basketball-league': {
    sport: 'basketball',
    he: 'ליגת העל בכדורסל',
    en: 'Israeli Basketball Premier League',
    ar: 'دوري كرة السلة الإسرائيلي الممتاز',
  },
};

export const TEAMS = {
  'demo-fc': {
    name: { he: 'דמו FC', en: 'Demo FC', ar: 'ديمو FC' },
    short_name: { he: 'דמו FC', en: 'Demo FC', ar: 'ديمو FC' },
    sport: 'football',
    leagues: ['premier-league'],
    primary_color: '#0D0E11',
  },
  'demo-united': {
    name: { he: 'דמו יונייטד', en: 'Demo United', ar: 'ديمو يونايتد' },
    short_name: { he: 'יונייטד', en: 'United', ar: 'يونايتد' },
    sport: 'football',
    leagues: ['la-liga'],
    primary_color: '#1F4FD8',
  },
  'demo-stars': {
    name: { he: 'דמו סטארס', en: 'Demo Stars', ar: 'ديمو ستارز' },
    short_name: { he: 'סטארס', en: 'Stars', ar: 'ستارز' },
    sport: 'basketball',
    leagues: ['nba'],
    primary_color: '#0E8C7F',
  },
};

export const SIZE_CHARTS = {
  'demo-adult': {
    name: { he: 'טבלת מידות לדוגמה – מבוגרים', en: 'Sample size chart – adults', ar: 'جدول مقاسات تجريبي – الكبار' },
    audience: 'adult',
    table: [
      { size: 'S', chest_cm: 96, length_cm: 70 },
      { size: 'M', chest_cm: 102, length_cm: 72 },
      { size: 'L', chest_cm: 108, length_cm: 74 },
      { size: 'XL', chest_cm: 114, length_cm: 76 },
    ],
    fit_note: {
      he: 'נתונים לדוגמה בלבד, לבדיקת העיצוב.',
      en: 'Sample figures for design review only.',
      ar: 'أرقام تجريبية لمراجعة التصميم فقط.',
    },
  },
  'demo-kids': {
    name: { he: 'טבלת מידות לדוגמה – ילדים', en: 'Sample size chart – kids', ar: 'جدول مقاسات تجريبي – الأطفال' },
    audience: 'kids',
    table: [
      { size: '5-6', height_cm: 116, chest_cm: 64, length_cm: 48 },
      { size: '7-8', height_cm: 128, chest_cm: 70, length_cm: 52 },
      { size: '9-10', height_cm: 140, chest_cm: 76, length_cm: 56 },
      { size: '11-12', height_cm: 152, chest_cm: 82, length_cm: 60 },
      { size: '13-14', height_cm: 164, chest_cm: 88, length_cm: 64 },
    ],
    fit_note: {
      he: 'נתונים לדוגמה בלבד, לבדיקת העיצוב.',
      en: 'Sample figures for design review only.',
      ar: 'أرقام تجريبية لمراجعة التصميم فقط.',
    },
  },
  // The supplier's charts in the shape the store keeps them: { rows: [...] } with the sizes we sell.
  // Keys the theme does not show (sleeve_cm, waist_half_cm) stay in, as they would in the store.
  'jerseyxie-football-adult': {
    name: {
      he: 'טבלת מידות – חולצת כדורגל למבוגרים',
      en: 'Size chart – adult football jersey',
      ar: 'جدول المقاسات – قميص كرة قدم للكبار',
    },
    audience: 'adult',
    table: { rows: supplierRows('football-adult-fan', ['S', 'M', 'L', 'XL']) },
    fit_note: {
      he: 'המידות נמדדו על הבגד עצמו, וייתכן הבדל של 1–2 ס״מ.',
      en: 'Measured on the garment itself; allow 1–2 cm of difference.',
      ar: 'القياسات مأخوذة من القطعة نفسها، وقد يوجد فرق 1–2 سم.',
    },
  },
  'jerseyxie-football-kids-set': {
    name: {
      he: 'טבלת מידות – סט כדורגל לילדים (חולצה ומכנס)',
      en: 'Size chart – kids football kit (jersey and shorts)',
      ar: 'جدول المقاسات – طقم كرة قدم للأطفال (قميص وشورت)',
    },
    audience: 'kids',
    table: { rows: supplierRows('football-kids-set', ['16', '18', '20', '22', '24', '26', '28']) },
    fit_note: {
      he: 'המידות נמדדו על הבגד עצמו, וייתכן הבדל של 1–2 ס״מ. בין שתי מידות? כדאי לבחור את הגדולה.',
      en: 'Measured on the garment itself; allow 1–2 cm of difference. Between two sizes? Choose the larger one.',
      ar: 'القياسات مأخوذة من القطعة نفسها، وقد يوجد فرق 1–2 سم. بين مقاسين؟ اختاروا المقاس الأكبر.',
    },
  },
};

/** Rows of one of the supplier's charts, limited to the given sizes (in the chart's order). */
function supplierRows(chart, sizes) {
  const rows = JERSEYXIE.charts[chart]?.rows ?? [];
  const picked = rows.filter((row) => sizes.includes(row.size));
  if (picked.length !== sizes.length) throw new Error(`jerseyxie chart "${chart}" lacks some of ${sizes.join(', ')}`);
  return picked;
}

export const OPTION_NAME = { he: 'מידה', en: 'Size', ar: 'المقاس' };
export const ADULT_SIZES = ['S', 'M', 'L', 'XL'];
export const KIDS_SIZES = ['5-6', '7-8', '9-10', '11-12', '13-14'];
/** The supplier's kids set sizes (ages 2-3 ... 12-13 in its chart). */
export const KIDS_SET_SIZES = ['16', '18', '20', '22', '24', '26', '28'];

export const PRODUCT_TYPES = {
  'Football Jersey': { he: 'חולצת כדורגל', en: 'Football Jersey', ar: 'قميص كرة قدم' },
  'Football Kit': { he: 'סט כדורגל', en: 'Football Kit', ar: 'طقم كرة قدم' },
  'Basketball Jersey': { he: 'גופיית כדורסל', en: 'Basketball Jersey', ar: 'قميص كرة سلة' },
  'Basketball Shorts': { he: 'מכנס כדורסל', en: 'Basketball Shorts', ar: 'شورت كرة سلة' },
};

const DESCRIPTION = {
  adult: {
    he: '<p>מוצר לדוגמה שנועד להציג את עיצוב האתר. הוא יוסר לפני ההשקה.</p><ul><li>מידות מבוגרים: S עד XL</li><li>משלוח עד הבית תוך 3 ימי עסקים</li><li>אפשר להחזיר עד 45 יום</li></ul>',
    en: '<p>A sample product that shows the store design. It will be removed before launch.</p><ul><li>Adult sizes: S to XL</li><li>Home delivery within 3 business days</li><li>Returns within 45 days</li></ul>',
    ar: '<p>منتج تجريبي لعرض تصميم المتجر، وسيُزال قبل الإطلاق.</p><ul><li>مقاسات الكبار: من S إلى XL</li><li>توصيل إلى البيت خلال 3 أيام عمل</li><li>إرجاع حتى 45 يومًا</li></ul>',
  },
  kids: {
    he: '<p>מוצר לדוגמה שנועד להציג את עיצוב האתר. הוא יוסר לפני ההשקה.</p><ul><li>מידות ילדים: 5-6 עד 13-14 (גובה 116 עד 164 ס״מ)</li><li>משלוח עד הבית תוך 3 ימי עסקים</li><li>אפשר להחזיר עד 45 יום</li></ul>',
    en: '<p>A sample product that shows the store design. It will be removed before launch.</p><ul><li>Kids sizes: 5-6 to 13-14 (height 116 to 164 cm)</li><li>Home delivery within 3 business days</li><li>Returns within 45 days</li></ul>',
    ar: '<p>منتج تجريبي لعرض تصميم المتجر، وسيُزال قبل الإطلاق.</p><ul><li>مقاسات الأطفال: من 5-6 إلى 13-14 (الطول من 116 إلى 164 سم)</li><li>توصيل إلى البيت خلال 3 أيام عمل</li><li>إرجاع حتى 45 يومًا</li></ul>',
  },
  'kids-set': {
    he: '<p>מוצר לדוגמה שנועד להציג את עיצוב האתר. הוא יוסר לפני ההשקה.</p><ul><li>סט: חולצה ומכנס</li><li>מידות 16 עד 28 (גילאי 2-3 עד 12-13, לפי טבלת המידות)</li><li>משלוח עד הבית תוך 3 ימי עסקים</li><li>אפשר להחזיר עד 45 יום</li></ul>',
    en: '<p>A sample product that shows the store design. It will be removed before launch.</p><ul><li>Kit: jersey and shorts</li><li>Sizes 16 to 28 (ages 2-3 to 12-13, see the size chart)</li><li>Home delivery within 3 business days</li><li>Returns within 45 days</li></ul>',
    ar: '<p>منتج تجريبي لعرض تصميم المتجر، وسيُزال قبل الإطلاق.</p><ul><li>طقم: قميص وشورت</li><li>المقاسات من 16 إلى 28 (الأعمار من 2-3 إلى 12-13، حسب جدول المقاسات)</li><li>توصيل إلى البيت خلال 3 أيام عمل</li><li>إرجاع حتى 45 يومًا</li></ul>',
  },
};

export const IMAGE_ALT_SUFFIX = {
  front: { he: 'מלפנים', en: 'front', ar: 'من الأمام' },
  back: { he: 'מאחור', en: 'back', ar: 'من الخلف' },
};

/**
 * SW_PREVIEW_EMPTY_STORE=1 renders the store as it is before any product reaches the Online Store
 * channel: no products, so collections, search and the cart are empty. Use it to see what the owner
 * sees in the real theme preview today.
 */
export const EMPTY_STORE = process.env.SW_PREVIEW_EMPTY_STORE === '1';

/**
 * Search keywords the catalog pipeline adds as product tags. Tags are not translated, so one list
 * serves searches in he, en and ar: synonyms such as "גופייה", "jersey" and "قميص".
 */
const FOOTBALL_KEYWORDS = ['חולצה', 'חולצת כדורגל', 'jersey', 'shirt', 'قميص', 'قميص كرة قدم'];
const KIDS_KEYWORDS = ['ילדים', 'kids', 'أطفال'];
const BASKETBALL_JERSEY_KEYWORDS = ['גופייה', 'גופיית כדורסל', 'jersey', 'tank', 'قميص', 'قميص كرة سلة', 'NBA'];
const BASKETBALL_SHORTS_KEYWORDS = ['מכנס', 'מכנסיים', 'shorts', 'شورت', 'NBA'];

/**
 * The 8 demo products of the store, then 2 preview-only ones with the supplier's size charts. Optional
 * fields: sizes (default by audience), sizeChart (SIZE_CHARTS handle, default demo-adult / demo-kids),
 * soldOut, price (agorot, like Shopify's cents; default PRICE), description (DESCRIPTION key).
 */
const DEMO_PRODUCTS = [
  {
    key: 'fc-home',
    handle: 'demo-fc-home-jersey-2026-27',
    title: { he: 'חולצת בית דמו FC 26/27', en: 'Demo FC Home Jersey 26/27', ar: 'قميص ديمو FC الأساسي 26/27' },
    type: 'Football Jersey',
    sport: 'football',
    team: 'demo-fc',
    league: 'premier-league',
    kit: 'home',
    audience: 'adult',
    image: 'demo-fc-home',
    extraTags: ['new'],
    keywords: FOOTBALL_KEYWORDS,
    counterpart: 'demo-fc-home-jersey-2026-27-kids',
    createdAt: '2026-09-24T10:00:00+03:00',
  },
  {
    key: 'fc-away',
    handle: 'demo-fc-away-jersey-2026-27',
    title: { he: 'חולצת חוץ דמו FC 26/27', en: 'Demo FC Away Jersey 26/27', ar: 'قميص ديمو FC الاحتياطي 26/27' },
    type: 'Football Jersey',
    sport: 'football',
    team: 'demo-fc',
    league: 'premier-league',
    kit: 'away',
    audience: 'adult',
    image: 'demo-fc-away',
    extraTags: ['sale'],
    keywords: FOOTBALL_KEYWORDS,
    compareAt: 15000,
    soldOut: ['XL'],
    createdAt: '2026-09-18T10:00:00+03:00',
  },
  {
    key: 'fc-home-kids',
    handle: 'demo-fc-home-jersey-2026-27-kids',
    title: {
      he: 'חולצת בית דמו FC 26/27 – ילדים',
      en: 'Demo FC Home Jersey 26/27 – Kids',
      ar: 'قميص ديمو FC الأساسي 26/27 – أطفال',
    },
    type: 'Football Jersey',
    sport: 'football',
    team: 'demo-fc',
    league: 'premier-league',
    kit: 'home',
    audience: 'kids',
    image: 'demo-fc-home',
    extraTags: [],
    keywords: [...FOOTBALL_KEYWORDS, ...KIDS_KEYWORDS],
    counterpart: 'demo-fc-home-jersey-2026-27',
    createdAt: '2026-09-17T10:00:00+03:00',
  },
  {
    key: 'united-home',
    handle: 'demo-united-home-jersey-2026-27',
    title: {
      he: 'חולצת בית דמו יונייטד 26/27',
      en: 'Demo United Home Jersey 26/27',
      ar: 'قميص ديمو يونايتد الأساسي 26/27',
    },
    type: 'Football Jersey',
    sport: 'football',
    team: 'demo-united',
    league: 'la-liga',
    kit: 'home',
    audience: 'adult',
    image: 'demo-united-home',
    extraTags: [],
    keywords: FOOTBALL_KEYWORDS,
    createdAt: '2026-09-15T10:00:00+03:00',
  },
  {
    key: 'united-third',
    handle: 'demo-united-third-jersey-2026-27',
    title: {
      he: 'חולצה שלישית דמו יונייטד 26/27',
      en: 'Demo United Third Jersey 26/27',
      ar: 'قميص ديمو يونايتد الثالث 26/27',
    },
    type: 'Football Jersey',
    sport: 'football',
    team: 'demo-united',
    league: 'la-liga',
    kit: 'third',
    audience: 'adult',
    image: 'demo-united-third',
    extraTags: ['new'],
    keywords: FOOTBALL_KEYWORDS,
    createdAt: '2026-09-23T10:00:00+03:00',
  },
  {
    key: 'stars-jersey',
    handle: 'demo-stars-basketball-jersey-2026-27',
    title: {
      he: 'גופיית כדורסל דמו סטארס 26/27',
      en: 'Demo Stars Basketball Jersey 26/27',
      ar: 'قميص كرة سلة ديمو ستارز 26/27',
    },
    type: 'Basketball Jersey',
    sport: 'basketball',
    team: 'demo-stars',
    league: 'nba',
    kit: 'home',
    audience: 'adult',
    image: 'demo-stars-home',
    extraTags: ['set'],
    keywords: BASKETBALL_JERSEY_KEYWORDS,
    complements: ['demo-stars-basketball-shorts-2026-27'],
    createdAt: '2026-09-21T10:00:00+03:00',
  },
  {
    key: 'stars-shorts',
    handle: 'demo-stars-basketball-shorts-2026-27',
    title: {
      he: 'מכנס כדורסל דמו סטארס 26/27',
      en: 'Demo Stars Basketball Shorts 26/27',
      ar: 'شورت كرة سلة ديمو ستارز 26/27',
    },
    type: 'Basketball Shorts',
    sport: 'basketball',
    team: 'demo-stars',
    league: 'nba',
    kit: 'home',
    audience: 'adult',
    image: 'demo-stars-shorts',
    extraTags: ['set'],
    keywords: BASKETBALL_SHORTS_KEYWORDS,
    complements: ['demo-stars-basketball-jersey-2026-27'],
    createdAt: '2026-09-21T11:00:00+03:00',
  },
  {
    key: 'stars-away',
    handle: 'demo-stars-basketball-jersey-2026-27-away',
    title: {
      he: 'גופיית כדורסל דמו סטארס 26/27 – חוץ',
      en: 'Demo Stars Basketball Jersey 26/27 – Away',
      ar: 'قميص كرة سلة ديمو ستارز 26/27 – الاحتياطي',
    },
    type: 'Basketball Jersey',
    sport: 'basketball',
    team: 'demo-stars',
    league: 'nba',
    kit: 'away',
    audience: 'adult',
    image: 'demo-stars-away',
    extraTags: [],
    keywords: BASKETBALL_JERSEY_KEYWORDS,
    createdAt: '2026-09-19T10:00:00+03:00',
  },
  // Preview-only (not in the store): products from the supplier jerseyxie, with its size charts.
  {
    key: 'united-away',
    handle: 'demo-united-away-jersey-2026-27',
    title: {
      he: 'חולצת חוץ דמו יונייטד 26/27',
      en: 'Demo United Away Jersey 26/27',
      ar: 'قميص ديمو يونايتد الاحتياطي 26/27',
    },
    type: 'Football Jersey',
    sport: 'football',
    team: 'demo-united',
    league: 'la-liga',
    kit: 'away',
    audience: 'adult',
    image: 'demo-united-third',
    extraTags: [],
    keywords: FOOTBALL_KEYWORDS,
    sizeChart: 'jerseyxie-football-adult',
    soldOut: ['L'],
    counterpart: 'demo-united-away-kit-2026-27-kids',
    createdAt: '2026-09-14T10:00:00+03:00',
  },
  {
    key: 'united-away-kids',
    handle: 'demo-united-away-kit-2026-27-kids',
    title: {
      he: 'סט חוץ דמו יונייטד 26/27 – ילדים',
      en: 'Demo United Away Kit 26/27 – Kids',
      ar: 'طقم ديمو يونايتد الاحتياطي 26/27 – أطفال',
    },
    type: 'Football Kit',
    sport: 'football',
    team: 'demo-united',
    league: 'la-liga',
    kit: 'away',
    audience: 'kids',
    image: 'demo-united-third',
    extraTags: [],
    keywords: [...FOOTBALL_KEYWORDS, ...KIDS_KEYWORDS],
    sizes: KIDS_SET_SIZES,
    sizeChart: 'jerseyxie-football-kids-set',
    soldOut: ['26'],
    // Kids sets: catalog/pricing.json (Football Kit, kids).
    price: 9900,
    description: 'kids-set',
    counterpart: 'demo-united-away-jersey-2026-27',
    createdAt: '2026-09-14T11:00:00+03:00',
  },
];

/** Default price in agorot (catalog/pricing.json: adult football jersey); a product can set its own. */
export const PRICE = 12000;
export const VENDOR = 'SportWear (דמו)';

export function descriptionFor(product, locale) {
  const text = DESCRIPTION[product.description ?? (product.audience === 'kids' ? 'kids' : 'adult')];
  return text[locale] ?? text.he;
}

/**
 * Team and player collections under the deeper main menu (sport → league → teams, basketball →
 * players → player). The demo catalog has only three (fictional) teams, so these collections borrow
 * the demo products of their sport to be non-empty; Toronto is empty on purpose (hidden from menus).
 * Hebrew titles use the geresh (׳, U+05F3) as the store's titles do.
 */
const basketball = (p) => p.sport === 'basketball';
const club = (he, en, ar, match = basketball) => ({ title: { he, en, ar }, match });
export const NBA_TEAMS = {
  'boston-celtics': club('בוסטון סלטיקס', 'Boston Celtics', 'بوسطن سلتيكس'),
  'los-angeles-lakers': club('לוס אנג׳לס לייקרס', 'Los Angeles Lakers', 'لوس أنجلوس ليكرز'),
  'golden-state-warriors': club('גולדן סטייט ווריורס', 'Golden State Warriors', 'غولدن ستايت ووريرز'),
  'chicago-bulls': club('שיקגו בולס', 'Chicago Bulls', 'شيكاغو بولز'),
  'miami-heat': club('מיאמי היט', 'Miami Heat', 'ميامي هيت'),
  'new-york-knicks': club('ניו יורק ניקס', 'New York Knicks', 'نيويورك نيكس'),
  'toronto-raptors': club('טורונטו ראפטורס', 'Toronto Raptors', 'تورونتو رابتورز', () => false),
  'dallas-mavericks': club('דאלאס מאבריקס', 'Dallas Mavericks', 'دالاس مافريكس'),
  'denver-nuggets': club('דנבר נאגטס', 'Denver Nuggets', 'دنفر ناغتس'),
  'milwaukee-bucks': club('מילווקי באקס', 'Milwaukee Bucks', 'ميلووكي باكس'),
  'oklahoma-city-thunder': club('אוקלהומה סיטי ת׳אנדר', 'Oklahoma City Thunder', 'أوكلاهوما سيتي ثاندر'),
  'phoenix-suns': club('פיניקס סאנס', 'Phoenix Suns', 'فينيكس صنز'),
  'brooklyn-nets': club('ברוקלין נטס', 'Brooklyn Nets', 'بروكلين نتس'),
};
export const EUROLEAGUE_TEAMS = {
  'maccabi-tel-aviv': club('מכבי תל אביב', 'Maccabi Tel Aviv', 'مكابي تل أبيب'),
  'hapoel-tel-aviv': club('הפועל תל אביב', 'Hapoel Tel Aviv', 'هبوعيل تل أبيب'),
  panathinaikos: club('פנאתינייקוס', 'Panathinaikos', 'باناثينايكوس'),
};
export const PLAYERS = {
  'lebron-james': club('לברון ג׳יימס', 'LeBron James', 'ليبرون جيمس'),
  'stephen-curry': club('סטף קרי', 'Stephen Curry', 'ستيفن كاري'),
  'luka-doncic': club('לוקה דונצ׳יץ׳', 'Luka Dončić', 'لوكا دونتشيتش'),
  'nikola-jokic': club('ניקולה יוקיץ׳', 'Nikola Jokić', 'نيكولا يوكيتش'),
  'giannis-antetokounmpo': club('יאניס אדטוקומבו', 'Giannis Antetokounmpo', 'يانيس أنتيتوكونمبو'),
  'jayson-tatum': club('ג׳ייסון טייטום', 'Jayson Tatum', 'جايسون تاتوم'),
  'shai-gilgeous-alexander': club('שיי גילג׳ס-אלכסנדר', 'Shai Gilgeous-Alexander', 'شاي غيلجيوس ألكسندر'),
  'deni-avdija': club('דני אבדיה', 'Deni Avdija', 'ديني أفدييا'),
  'kevin-durant': club('קווין דוראנט', 'Kevin Durant', 'كيفن ديورانت'),
  'anthony-edwards': club('אנתוני אדוארדס', 'Anthony Edwards', 'أنتوني إدواردز'),
};
const premierLeague = (p) => p.league === 'premier-league';
const laLiga = (p) => p.league === 'la-liga';
export const FOOTBALL_CLUBS = {
  arsenal: club('ארסנל', 'Arsenal', 'آرسنال', premierLeague),
  liverpool: club('ליברפול', 'Liverpool', 'ليفربول', premierLeague),
  'manchester-city': club('מנצ׳סטר סיטי', 'Manchester City', 'مانشستر سيتي', premierLeague),
  'manchester-united': club('מנצ׳סטר יונייטד', 'Manchester United', 'مانشستر يونايتد', premierLeague),
  'real-madrid': club('ריאל מדריד', 'Real Madrid', 'ريال مدريد', laLiga),
  barcelona: club('ברצלונה', 'Barcelona', 'برشلونة', laLiga),
};
const CLUB_COLLECTIONS = { ...NBA_TEAMS, ...EUROLEAGUE_TEAMS, ...PLAYERS, ...FOOTBALL_CLUBS };

/** Collections of the store (smart collections in admin). `match` picks products from PRODUCTS. */
export const COLLECTIONS = [
  {
    handle: 'all',
    title: { he: 'כל המוצרים', en: 'All products', ar: 'جميع المنتجات' },
    match: () => true,
  },
  {
    handle: 'football',
    title: { he: 'חולצות כדורגל', en: 'Football Jerseys', ar: 'قمصان كرة القدم' },
    description: {
      he: '<p>חולצות כדורגל של העונה, למבוגרים ולילדים. משלוח עד הבית תוך 3 ימי עסקים.</p>',
      en: "<p>This season's football jerseys, for adults and kids. Home delivery within 3 business days.</p>",
      ar: '<p>قمصان كرة القدم لهذا الموسم، للكبار والأطفال. توصيل إلى المنزل خلال 3 أيام عمل.</p>',
    },
    match: (p) => p.sport === 'football',
  },
  {
    handle: 'basketball',
    title: { he: 'כדורסל', en: 'Basketball', ar: 'كرة السلة' },
    description: {
      he: '<p>גופיות ומכנסי כדורסל, למבוגרים ולילדים. משלוח עד הבית תוך 3 ימי עסקים.</p>',
      en: '<p>Basketball jerseys and shorts, for adults and kids. Home delivery within 3 business days.</p>',
      ar: '<p>قمصان وشورتات كرة السلة، للكبار والأطفال. توصيل إلى المنزل خلال 3 أيام عمل.</p>',
    },
    match: (p) => p.sport === 'basketball',
  },
  {
    handle: 'basketball-jerseys',
    title: { he: 'גופיות כדורסל', en: 'Basketball Jerseys', ar: 'قمصان كرة السلة' },
    match: (p) => p.type === 'Basketball Jersey',
  },
  {
    handle: 'basketball-shorts',
    title: { he: 'מכנסי כדורסל', en: 'Basketball Shorts', ar: 'شورتات كرة السلة' },
    match: (p) => p.type === 'Basketball Shorts',
  },
  {
    handle: 'basketball-sets',
    title: { he: 'סטים לכדורסל', en: 'Basketball Sets', ar: 'أطقم كرة السلة' },
    match: (p) => p.extraTags.includes('set'),
  },
  {
    handle: 'kids',
    title: { he: 'ילדים', en: 'Kids', ar: 'الأطفال' },
    match: (p) => p.audience === 'kids',
  },
  { handle: 'sale', title: { he: 'מבצעים', en: 'Sale', ar: 'تخفيضات' }, match: (p) => p.extraTags.includes('sale') },
  {
    handle: 'new',
    title: { he: 'חדש באתר', en: 'New in', ar: 'وصل حديثًا' },
    match: (p) => p.extraTags.includes('new'),
  },
  {
    handle: 'best-sellers',
    title: { he: 'הנמכרים ביותר', en: 'Best sellers', ar: 'الأكثر مبيعًا' },
    order: [
      'demo-fc-home-jersey-2026-27',
      'demo-stars-basketball-jersey-2026-27',
      'demo-united-home-jersey-2026-27',
      'demo-fc-away-jersey-2026-27',
      'demo-stars-basketball-shorts-2026-27',
      'demo-united-third-jersey-2026-27',
      'demo-fc-home-jersey-2026-27-kids',
      'demo-stars-basketball-jersey-2026-27-away',
    ],
    match: () => true,
  },
  ...Object.entries(LEAGUES).map(([handle, league]) => ({
    handle,
    title: { he: league.he, en: league.en, ar: league.ar },
    match: (p) => p.league === handle,
  })),
  {
    handle: 'players',
    title: { he: 'שחקנים', en: 'Players', ar: 'اللاعبون' },
    match: (p) => p.type === 'Basketball Jersey',
  },
  ...Object.entries(CLUB_COLLECTIONS).map(([handle, club]) => ({
    handle,
    title: club.title,
    match: club.match,
  })),
];

export const PAGES = [
  {
    handle: 'shipping-returns',
    title: { he: 'משלוחים והחזרות', en: 'Shipping and returns', ar: 'الشحن والإرجاع' },
    content: {
      he: '<p>כל ההזמנות נשלחות מהמלאי שלנו בישראל.</p><h2>משלוחים</h2><ul><li>משלוח עד הבית תוך 3 ימי עסקים</li><li>דמי משלוח: 35 ₪</li></ul><h2>החזרות</h2><p>אפשר להחזיר מוצר עד 45 יום מקבלתו. הנוסח הסופי ממתין לבדיקה משפטית.</p><table><thead><tr><th>שירות</th><th>זמן</th><th>מחיר</th></tr></thead><tbody><tr><td>משלוח רגיל</td><td>עד 3 ימי עסקים</td><td>35 ₪</td></tr><tr><td>החזרה</td><td>עד 45 יום</td><td>ללא עלות</td></tr></tbody></table>',
      en: '<p>Every order ships from our stock in Israel.</p><h2>Shipping</h2><ul><li>Home delivery within 3 business days</li><li>Shipping: ₪35</li></ul><h2>Returns</h2><p>You can return an item within 45 days of delivery. The final wording is pending legal review.</p><table><thead><tr><th>Service</th><th>Time</th><th>Price</th></tr></thead><tbody><tr><td>Standard shipping</td><td>Up to 3 business days</td><td>₪35</td></tr><tr><td>Returns</td><td>Up to 45 days</td><td>Free</td></tr></tbody></table>',
      ar: '<p>تُشحن جميع الطلبات من مخزوننا في إسرائيل.</p><h2>الشحن</h2><ul><li>توصيل إلى البيت خلال 3 أيام عمل</li><li>رسوم الشحن: 35 ₪</li></ul><h2>الإرجاع</h2><p>يمكن إرجاع المنتج خلال 45 يومًا من استلامه. الصيغة النهائية قيد المراجعة القانونية.</p><table><thead><tr><th>الخدمة</th><th>المدة</th><th>السعر</th></tr></thead><tbody><tr><td>شحن عادي</td><td>حتى 3 أيام عمل</td><td>35 ₪</td></tr><tr><td>الإرجاع</td><td>حتى 45 يومًا</td><td>مجانًا</td></tr></tbody></table>',
    },
  },
  {
    handle: 'contact',
    title: { he: 'צור קשר', en: 'Contact us', ar: 'اتصل بنا' },
    content: {
      he: '<p>יש לכם שאלה? כתבו לנו ונחזור אליכם בהקדם.</p>',
      en: '<p>Have a question? Write to us and we will get back to you soon.</p>',
      ar: '<p>هل لديكم سؤال؟ راسلونا وسنرد عليكم قريبًا.</p>',
    },
  },
  {
    handle: 'team-orders',
    title: { he: 'הזמנות לקבוצות', en: 'Team orders', ar: 'طلبات الفرق' },
    content: {
      he: '<p>מזמינים לקבוצה? נשמח להכין לכם הצעה.</p>',
      en: '<p>Ordering for a team? We will be happy to prepare a quote.</p>',
      ar: '<p>تطلبون لفريق؟ يسعدنا إعداد عرض لكم.</p>',
    },
  },
  {
    handle: 'faq',
    title: { he: 'שאלות נפוצות', en: 'FAQ', ar: 'الأسئلة الشائعة' },
    content: {
      he: '<h2>איך בוחרים מידה?</h2><p>בעמוד של כל מוצר יש טבלת מידות.</p><h2>כמה זמן לוקח משלוח?</h2><p>עד 3 ימי עסקים.</p>',
      en: '<h2>How do I choose a size?</h2><p>Every product page has a size chart.</p><h2>How long does delivery take?</h2><p>Up to 3 business days.</p>',
      ar: '<h2>كيف أختار المقاس؟</h2><p>في صفحة كل منتج جدول مقاسات.</p><h2>كم يستغرق التوصيل؟</h2><p>حتى 3 أيام عمل.</p>',
    },
  },
  {
    handle: 'size-guide',
    title: { he: 'מדריך מידות', en: 'Size guide', ar: 'دليل المقاسات' },
    content: {
      he: '<p>טבלאות המידות יופיעו כאן.</p>',
      en: '<p>Size charts will appear here.</p>',
      ar: '<p>ستظهر جداول المقاسات هنا.</p>',
    },
  },
  {
    handle: 'accessibility',
    title: { he: 'הצהרת נגישות', en: 'Accessibility statement', ar: 'بيان إمكانية الوصول' },
    content: {
      he: '<p>אנחנו פועלים להנגיש את האתר לפי תקן ישראלי 5568.</p>',
      en: '<p>We are working to make this site accessible according to Israeli Standard 5568.</p>',
      ar: '<p>نعمل على إتاحة هذا الموقع وفق المعيار الإسرائيلي 5568.</p>',
    },
  },
];

export const BLOG = {
  handle: 'news',
  title: { he: 'חדשות', en: 'News', ar: 'الأخبار' },
  articles: [
    {
      handle: 'new-season-26-27',
      title: { he: 'העונה החדשה כבר כאן', en: 'The new season is here', ar: 'الموسم الجديد هنا' },
      author: 'SportWear',
      publishedAt: '2026-09-20T09:00:00+03:00',
      image: 'demo-fc-home-front',
      tags: ['news'],
      content: {
        he: '<p>חולצות עונת 26/27 הגיעו למלאי. זהו מאמר לדוגמה.</p>',
        en: '<p>Jerseys for the 26/27 season are in stock. This is a sample article.</p>',
        ar: '<p>وصلت قمصان موسم 26/27 إلى المخزون. هذا مقال تجريبي.</p>',
      },
    },
    {
      handle: 'team-orders-guide',
      title: { he: 'איך מזמינים לקבוצה', en: 'How to order for a team', ar: 'كيف تطلبون لفريق' },
      author: 'SportWear',
      publishedAt: '2026-09-12T09:00:00+03:00',
      image: 'demo-stars-home-front',
      tags: ['guides'],
      content: {
        he: '<p>כך מזמינים חולצות לקבוצה שלכם. זהו מאמר לדוגמה.</p>',
        en: '<p>This is how you order jerseys for your team. This is a sample article.</p>',
        ar: '<p>هكذا تطلبون القمصان لفريقكم. هذا مقال تجريبي.</p>',
      },
    },
  ],
};

/** Menus as created in admin (catalog/store-setup.json), with the translations we expect. */
const collectionLink = (handle, title, links = []) => ({ type: 'collection_link', target: handle, title, links });
const pageLink = (handle, title) => ({ type: 'page_link', target: handle, title, links: [] });
/** Third-level links: one collection link per team or player. */
const clubLinks = (clubs) => Object.entries(clubs).map(([handle, { title }]) => collectionLink(handle, title));

export const MENUS = {
  'main-menu': {
    title: { he: 'תפריט ראשי', en: 'Main menu', ar: 'القائمة الرئيسية' },
    links: [
      collectionLink('football', { he: 'חולצות כדורגל', en: 'Football jerseys', ar: 'قمصان كرة القدم' }, [
        collectionLink(
          'premier-league',
          { he: 'פרמייר ליג', en: 'Premier League', ar: 'الدوري الإنجليزي الممتاز' },
          clubLinks(Object.fromEntries(Object.entries(FOOTBALL_CLUBS).filter(([, c]) => c.match === premierLeague))),
        ),
        collectionLink(
          'la-liga',
          { he: 'לה ליגה', en: 'LaLiga', ar: 'الدوري الإسباني' },
          clubLinks(Object.fromEntries(Object.entries(FOOTBALL_CLUBS).filter(([, c]) => c.match === laLiga))),
        ),
        collectionLink('serie-a', { he: 'סרייה A', en: 'Serie A', ar: 'الدوري الإيطالي' }),
        collectionLink('bundesliga', { he: 'בונדסליגה', en: 'Bundesliga', ar: 'الدوري الألماني' }),
        collectionLink('ligue-1', { he: 'ליג 1', en: 'Ligue 1', ar: 'الدوري الفرنسي' }),
        collectionLink('israeli-premier-league', {
          he: 'ליגת העל',
          en: 'Israeli Premier League',
          ar: 'الدوري الإسرائيلي الممتاز',
        }),
        collectionLink('national-teams', { he: 'נבחרות', en: 'National teams', ar: 'المنتخبات' }),
      ]),
      collectionLink('basketball', { he: 'כדורסל', en: 'Basketball', ar: 'كرة السلة' }, [
        collectionLink('nba', { he: 'NBA', en: 'NBA', ar: 'NBA' }, clubLinks(NBA_TEAMS)),
        collectionLink('euroleague', { he: 'יורוליג', en: 'EuroLeague', ar: 'اليوروليغ' }, clubLinks(EUROLEAGUE_TEAMS)),
        collectionLink('players', { he: 'שחקנים', en: 'Players', ar: 'اللاعبون' }, clubLinks(PLAYERS)),
        collectionLink('israeli-basketball-league', {
          he: 'ליגת העל בכדורסל',
          en: 'Israeli Basketball League',
          ar: 'دوري كرة السلة الإسرائيلي',
        }),
        collectionLink('basketball-jerseys', { he: 'גופיות כדורסל', en: 'Basketball jerseys', ar: 'قمصان كرة السلة' }),
        collectionLink('basketball-shorts', { he: 'מכנסי כדורסל', en: 'Basketball shorts', ar: 'شورتات كرة السلة' }),
        collectionLink('basketball-sets', { he: 'סטים לכדורסל', en: 'Basketball sets', ar: 'أطقم كرة السلة' }),
      ]),
      collectionLink('kids', { he: 'ילדים', en: 'Kids', ar: 'الأطفال' }),
      collectionLink('sale', { he: 'מבצעים', en: 'Sale', ar: 'تخفيضات' }),
      pageLink('team-orders', { he: 'הזמנות לקבוצות', en: 'Team orders', ar: 'طلبات الفرق' }),
    ],
  },
  footer: {
    title: { he: 'שירות לקוחות', en: 'Customer Service', ar: 'خدمة العملاء' },
    links: [
      pageLink('size-guide', { he: 'מדריך מידות', en: 'Size guide', ar: 'دليل المقاسات' }),
      pageLink('shipping-returns', { he: 'משלוחים והחזרות', en: 'Shipping and returns', ar: 'الشحن والإرجاع' }),
      pageLink('faq', { he: 'שאלות נפוצות', en: 'FAQ', ar: 'الأسئلة الشائعة' }),
      pageLink('team-orders', { he: 'הזמנות לקבוצות', en: 'Team orders', ar: 'طلبات الفرق' }),
      pageLink('contact', { he: 'צור קשר', en: 'Contact us', ar: 'اتصل بنا' }),
      pageLink('accessibility', { he: 'הצהרת נגישות', en: 'Accessibility statement', ar: 'بيان إمكانية الوصول' }),
      { type: 'search_link', target: null, title: { he: 'חיפוש', en: 'Search', ar: 'بحث' }, links: [] },
    ],
  },
  'footer-shop': {
    title: { he: 'קניות', en: 'Shop', ar: 'تسوّق' },
    links: [
      collectionLink('football', { he: 'חולצות כדורגל', en: 'Football jerseys', ar: 'قمصان كرة القدم' }),
      collectionLink('basketball-jerseys', { he: 'גופיות כדורסל', en: 'Basketball jerseys', ar: 'قمصان كرة السلة' }),
      collectionLink('basketball-shorts', { he: 'מכנסי כדורסל', en: 'Basketball shorts', ar: 'شورتات كرة السلة' }),
      collectionLink('kids', { he: 'ילדים', en: 'Kids', ar: 'الأطفال' }),
      collectionLink('new', { he: 'חדש באתר', en: 'New in', ar: 'وصل حديثًا' }),
      collectionLink('sale', { he: 'מבצעים', en: 'Sale', ar: 'تخفيضات' }),
    ],
  },
};

export const POLICIES = [
  { handle: 'refund-policy', title: { he: 'מדיניות החזרות', en: 'Refund policy', ar: 'سياسة الاسترداد' } },
  { handle: 'privacy-policy', title: { he: 'מדיניות פרטיות', en: 'Privacy policy', ar: 'سياسة الخصوصية' } },
  { handle: 'terms-of-service', title: { he: 'תנאי שימוש', en: 'Terms of service', ar: 'شروط الخدمة' } },
  { handle: 'shipping-policy', title: { he: 'מדיניות משלוחים', en: 'Shipping policy', ar: 'سياسة الشحن' } },
];

/** Default cart (cart page, cart drawer on every page): a sale jersey and a basketball jersey. */
export const PRODUCTS = EMPTY_STORE ? [] : DEMO_PRODUCTS;

export const CART_LINES = EMPTY_STORE
  ? []
  : [
      { handle: 'demo-fc-away-jersey-2026-27', size: 'M', quantity: 1 },
      { handle: 'demo-stars-basketball-jersey-2026-27', size: 'L', quantity: 1 },
    ];

/** Shopify-generated strings that the theme does not control (sort names, filter labels, titles). */
export const SYSTEM_STRINGS = {
  sort: {
    manual: { he: 'מומלצים', en: 'Featured', ar: 'مميز' },
    'best-selling': { he: 'הנמכרים ביותר', en: 'Best selling', ar: 'الأكثر مبيعًا' },
    'title-ascending': { he: 'לפי א״ב, א-ת', en: 'Alphabetically, A-Z', ar: 'أبجديًا، من أ إلى ي' },
    'title-descending': { he: 'לפי א״ב, ת-א', en: 'Alphabetically, Z-A', ar: 'أبجديًا، من ي إلى أ' },
    'price-ascending': { he: 'מחיר, מהנמוך לגבוה', en: 'Price, low to high', ar: 'السعر، من الأقل إلى الأعلى' },
    'price-descending': { he: 'מחיר, מהגבוה לנמוך', en: 'Price, high to low', ar: 'السعر، من الأعلى إلى الأقل' },
    'created-ascending': { he: 'תאריך, מהישן לחדש', en: 'Date, old to new', ar: 'التاريخ، من الأقدم إلى الأحدث' },
    'created-descending': { he: 'תאריך, מהחדש לישן', en: 'Date, new to old', ar: 'التاريخ، من الأحدث إلى الأقدم' },
    relevance: { he: 'רלוונטיות', en: 'Relevance', ar: 'الصلة' },
  },
  filters: {
    availability: { he: 'זמינות', en: 'Availability', ar: 'التوفر' },
    in_stock: { he: 'במלאי', en: 'In stock', ar: 'متوفر' },
    out_of_stock: { he: 'אזל מהמלאי', en: 'Out of stock', ar: 'غير متوفر' },
    price: { he: 'מחיר', en: 'Price', ar: 'السعر' },
    product_type: { he: 'סוג מוצר', en: 'Product type', ar: 'نوع المنتج' },
  },
  titles: {
    cart: { he: 'עגלת הקניות שלך', en: 'Your Shopping Cart', ar: 'سلة التسوق الخاصة بك' },
    search: { he: 'חיפוש', en: 'Search', ar: 'بحث' },
    not_found: { he: '404 הדף לא נמצא', en: '404 Not Found', ar: '404 الصفحة غير موجودة' },
    collections: { he: 'קטגוריות', en: 'Collections', ar: 'المجموعات' },
    password: { he: 'בקרוב', en: 'Opening soon', ar: 'قريبًا' },
  },
  powered_by: { he: 'מופעל על ידי Shopify', en: 'Powered by Shopify', ar: 'مدعوم من Shopify' },
};
