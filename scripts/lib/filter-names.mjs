// The names dictionary of SportWear's storefront filters: he/en/ar names for every value of the
// filter metafields (namespace sportwear) and for the product types. It is the value of the shop
// metafield sportwear.filter_names, which snippets/facet-label.liquid reads. Enumerations carry an
// "order" (their display order); teams, leagues and players have none and sort by name.
// Used by scripts/catalog/filter-data.mjs and by the local preview harness.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const pick = (entry) => (entry ? { he: entry.he, en: entry.en, ar: entry.ar } : null);

export const ENUM_ORDER = {
  audience: ['adult', 'kids', 'women'],
  product_type: ['Football Jersey', 'Football Kit', 'Basketball Jersey', 'Basketball Shorts', 'Hoodie'],
  kit: ['home', 'away', 'third', 'fourth', 'special', 'training'],
  styles: ['retro', 'city-edition', 'special'],
};

/**
 * @param {{ taxonomy?: object, classification?: object }} [sources] Defaults to catalog/taxonomy.json
 *   and catalog/classification.json (classification fills the names taxonomy lacks).
 */
export function buildFilterNames(sources = {}) {
  const taxonomy = sources.taxonomy ?? JSON.parse(readFileSync(path.join(repoRoot, 'catalog/taxonomy.json'), 'utf8'));
  const classification =
    sources.classification ?? JSON.parse(readFileSync(path.join(repoRoot, 'catalog/classification.json'), 'utf8'));

  const withOrder = (source, keys) =>
    Object.fromEntries(keys.map((key, index) => [key, { ...pick(source[key]), order: index + 1 }]));

  const teams = {};
  for (const entry of Object.values(taxonomy.teams)) teams[entry.slug] ??= pick(entry);
  for (const [slug, entry] of Object.entries(classification.teams ?? {})) teams[slug] ??= pick(entry);

  const leagues = {};
  for (const [slug, entry] of Object.entries(taxonomy.leagues)) leagues[slug] = pick(entry);
  for (const [slug, entry] of Object.entries(classification.leagues ?? {})) leagues[slug] ??= pick(entry);

  const players = {};
  for (const [slug, entry] of Object.entries(taxonomy.players)) players[slug] = pick(entry);
  for (const [slug, entry] of Object.entries(classification.players ?? {})) players[slug] ??= pick(entry);

  return {
    audience: withOrder(taxonomy.audiences, ENUM_ORDER.audience),
    product_type: withOrder(taxonomy.product_types, ENUM_ORDER.product_type),
    kit: withOrder(taxonomy.kits, ENUM_ORDER.kit),
    styles: withOrder(taxonomy.styles, ENUM_ORDER.styles),
    league_handle: leagues,
    team_handle: teams,
    player: players,
  };
}
