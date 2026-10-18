// =====================================================================
// Attribute facets
// =====================================================================
// Pure facet logic shared by both catalogue grids: FilterableProductGrid
// (standard / filter-bar layout) and CatalogGrid (price_pill catalogue
// mode). Kept in its own module so neither grid has to import the other.
// =====================================================================

import { resolveI18n, type LocaleCode, type ResolvedProductAttribute } from "@scheniders/shared";
import type { Product } from "../types";

/** One selectable value: `<attribute key>:<value>`. */
export type FacetId = string;

export interface Facet {
  /** Attribute key — groups options under one heading. */
  key: string;
  name: string;
  options: { id: FacetId; label: string; count: number }[];
}

function facetIdOf(attr: ResolvedProductAttribute): FacetId | null {
  if (attr.kind === "enum") return `${attr.def.key}:${attr.value}`;
  if (attr.kind === "boolean" && attr.value) return `${attr.def.key}:true`;
  return null;
}

/**
 * Facets built from what this page's products actually carry — never from
 * the whole taxonomy. A filter that returns nothing is worse than no
 * filter, so an option only appears if at least one product has it.
 *
 * Only `enum` and `boolean` are offered. A range needs a threshold to
 * filter on, and any threshold this code invented ("4 and above") would be
 * a number no merchant chose — exactly the hardcoding this program exists
 * to remove. Range facets wait until the merchant can express the buckets.
 */
export function buildFacets(products: Product[], locale: LocaleCode): Facet[] {
  const byKey = new Map<string, { name: string; order: number; options: Map<string, { label: string; count: number }> }>();

  for (const p of products) {
    for (const attr of p.attributes ?? []) {
      if (!attr.def.is_filterable) continue;
      const id = facetIdOf(attr);
      if (!id) continue;

      let group = byKey.get(attr.def.key);
      if (!group) {
        group = {
          name: resolveI18n(attr.def.name_i18n, locale) || attr.def.key,
          order: attr.def.display_order,
          options: new Map(),
        };
        byKey.set(attr.def.key, group);
      }

      const label =
        attr.kind === "enum"
          ? resolveI18n(attr.option.label_i18n, locale) || attr.value
          : group.name;
      const existing = group.options.get(id);
      if (existing) existing.count += 1;
      else group.options.set(id, { label, count: 1 });
    }
  }

  return [...byKey.entries()]
    .sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]))
    .map(([key, g]) => ({
      key,
      name: g.name,
      options: [...g.options.entries()]
        .map(([id, o]) => ({ id, label: o.label, count: o.count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    }))
    // Keep a facet only if selecting something in it would actually change
    // the list. That is NOT "more than one option": a boolean carried by
    // some products but not all is a single option that narrows perfectly
    // well, while an enum every product shares narrows nothing.
    .filter((f) => f.options.some((o) => o.count < products.length));
}

export function matchesFacets(
  p: Product,
  selected: ReadonlySet<FacetId>,
  facets: Facet[],
): boolean {
  if (selected.size === 0) return true;
  const own = new Set(
    (p.attributes ?? []).map(facetIdOf).filter((id): id is FacetId => id !== null),
  );
  // Within one attribute the options are alternatives (OR); across different
  // attributes they narrow (AND). Picking "oriental" and "woody" should widen
  // the list, not empty it.
  for (const facet of facets) {
    const picked = facet.options.map((o) => o.id).filter((id) => selected.has(id));
    if (picked.length === 0) continue;
    if (!picked.some((id) => own.has(id))) return false;
  }
  return true;
}
