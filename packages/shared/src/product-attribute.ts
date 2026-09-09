// =====================================================================
// Product attributes — merchant-defined taxonomy
// =====================================================================
// A tenant declares which attributes its catalogue has; each product
// carries values for them. `kind` is the pivot: it decides the value's
// shape, and it decides which layout a section renders (range → meters,
// group_list → pyramid, enum → chips, …). That is what lets one set of
// sections serve a perfume house, a coffee roaster and an electronics
// shop without any of them knowing what they sell.
//
// Mirrors packages/supabase/migrations/20260909130000_product_attributes.sql.
// The database enforces the same shape-per-kind rule with a CHECK; this
// module is the read-side boundary, so a row that somehow violates it is
// dropped rather than handed to a renderer.
// =====================================================================

import { z } from "zod";
import type { I18nString } from "./types/store-config-v2";

export const PRODUCT_ATTRIBUTE_KINDS = [
  "enum",
  "range",
  "group_list",
  "text",
  "boolean",
] as const;

export type ProductAttributeKind = (typeof PRODUCT_ATTRIBUTE_KINDS)[number];

/* ─────────────────────────────────────────────────────────────────── */
/* Schemas — the DB boundary                                            */
/* ─────────────────────────────────────────────────────────────────── */

// Locale keys are open here on purpose: `I18nString` is a Partial record
// over LocaleCode, and this parses rows the merchant authored, so an
// unknown locale key should not invalidate the whole attribute.
const i18nSchema = z.record(z.string(), z.string());

/**
 * A jsonb number, or the numeric string PostgREST returns for a `numeric`
 * column. Deliberately NOT `z.coerce.number()`: coercion turns null into 0,
 * true into 1 and [] into 0, so a missing value would render as a filled-in
 * meter rather than no meter at all.
 */
const numericSchema = z
  .union([z.number(), z.string().regex(/^\s*-?\d+(\.\d+)?\s*$/)])
  .transform((v) => (typeof v === "number" ? v : Number(v.trim())))
  .refine(Number.isFinite);

const enumOptionSchema = z.object({
  value: z.string().min(1),
  label_i18n: i18nSchema.optional(),
});

const groupKeySchema = z.object({
  key: z.string().min(1),
  label_i18n: i18nSchema.optional(),
});

const defBaseShape = {
  id: z.string(),
  key: z.string(),
  name_i18n: i18nSchema.nullish().transform((v) => v ?? {}),
  is_filterable: z.boolean().nullish().transform((v) => v ?? true),
  is_comparable: z.boolean().nullish().transform((v) => v ?? false),
  display_order: z.number().nullish().transform((v) => v ?? 0),
};

/**
 * A definition row, narrowed by `kind`. Each branch requires exactly the
 * fields its renderer needs, so a section never has to defend against a
 * half-configured attribute — it cannot get one.
 */
export const productAttributeDefSchema = z.discriminatedUnion("kind", [
  z.object({
    ...defBaseShape,
    kind: z.literal("enum"),
    options: z.array(enumOptionSchema).min(1),
  }),
  z.object({
    ...defBaseShape,
    kind: z.literal("range"),
    range_min: numericSchema,
    range_max: numericSchema,
    unit_i18n: i18nSchema.nullish().transform((v) => v ?? undefined),
  }),
  z.object({
    ...defBaseShape,
    kind: z.literal("group_list"),
    group_keys: z.array(groupKeySchema).min(1),
  }),
  z.object({ ...defBaseShape, kind: z.literal("text") }),
  z.object({ ...defBaseShape, kind: z.literal("boolean") }),
]);

export type ProductAttributeDef = z.infer<typeof productAttributeDefSchema>;

export type EnumAttributeDef = Extract<ProductAttributeDef, { kind: "enum" }>;
export type RangeAttributeDef = Extract<ProductAttributeDef, { kind: "range" }>;
export type GroupListAttributeDef = Extract<ProductAttributeDef, { kind: "group_list" }>;

/**
 * A definition paired with one product's value for it. Discriminated on
 * `kind` so a renderer can `switch` and get both the narrowed definition
 * and the correctly typed value with no casting.
 */
export type ResolvedProductAttribute =
  | { kind: "enum"; def: EnumAttributeDef; value: string; option: EnumOption }
  | { kind: "range"; def: RangeAttributeDef; value: number }
  | { kind: "group_list"; def: GroupListAttributeDef; value: Record<string, string[]> }
  | { kind: "text"; def: Extract<ProductAttributeDef, { kind: "text" }>; value: I18nString }
  | { kind: "boolean"; def: Extract<ProductAttributeDef, { kind: "boolean" }>; value: boolean };

export type EnumOption = z.infer<typeof enumOptionSchema>;

/** One `product_attribute_values` row as the storefront reads it. */
export interface ProductAttributeValueRow {
  product_id: string;
  attribute_def_id: string;
  value: unknown;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Resolution                                                           */
/* ─────────────────────────────────────────────────────────────────── */

const groupListValueSchema = z.record(z.string(), z.array(z.string()));

/**
 * Pair one definition with one raw jsonb value.
 *
 * Returns `null` when the value does not match the definition's kind, or
 * when an enum value is not one of the declared options — a stale value
 * left behind after the merchant removed an option would otherwise render
 * as a chip with no label.
 */
export function resolveProductAttribute(
  def: ProductAttributeDef,
  raw: unknown,
): ResolvedProductAttribute | null {
  switch (def.kind) {
    case "enum": {
      const parsed = z.string().safeParse(raw);
      if (!parsed.success) return null;
      const option = def.options.find((o) => o.value === parsed.data);
      if (!option) return null;
      return { kind: "enum", def, value: parsed.data, option };
    }
    case "range": {
      const parsed = numericSchema.safeParse(raw);
      if (!parsed.success) return null;
      // Clamp rather than reject: a value outside the declared scale is a
      // merchant typo, and a meter drawn past its own axis is worse than a
      // meter pinned to the end of it.
      const value = Math.min(def.range_max, Math.max(def.range_min, parsed.data));
      return { kind: "range", def, value };
    }
    case "group_list": {
      const parsed = groupListValueSchema.safeParse(raw);
      if (!parsed.success) return null;
      // Keep only declared groups, in the order the merchant declared them,
      // and drop groups that ended up empty.
      const value: Record<string, string[]> = {};
      for (const g of def.group_keys) {
        const items = parsed.data[g.key]?.filter((s) => s.trim().length > 0) ?? [];
        if (items.length > 0) value[g.key] = items;
      }
      if (Object.keys(value).length === 0) return null;
      return { kind: "group_list", def, value };
    }
    case "text": {
      const parsed = i18nSchema.safeParse(raw);
      if (!parsed.success) return null;
      const hasText = Object.values(parsed.data).some((s) => s.trim().length > 0);
      return hasText ? { kind: "text", def, value: parsed.data } : null;
    }
    case "boolean": {
      const parsed = z.boolean().safeParse(raw);
      return parsed.success ? { kind: "boolean", def, value: parsed.data } : null;
    }
  }
}

/**
 * Resolve every value row for ONE product against the tenant's taxonomy,
 * ordered by the merchant's `display_order`. Unknown definitions, unknown
 * kinds and mismatched values are dropped silently — this runs on the
 * render path, where a bad row must not take the page down.
 */
export function resolveProductAttributes(
  defs: readonly unknown[],
  values: readonly ProductAttributeValueRow[],
): ResolvedProductAttribute[] {
  const byId = new Map<string, ProductAttributeDef>();
  for (const raw of defs) {
    const parsed = productAttributeDefSchema.safeParse(raw);
    if (parsed.success) byId.set(parsed.data.id, parsed.data);
  }

  const out: ResolvedProductAttribute[] = [];
  for (const row of values) {
    const def = byId.get(row.attribute_def_id);
    if (!def) continue;
    const resolved = resolveProductAttribute(def, row.value);
    if (resolved) out.push(resolved);
  }

  return out.sort(
    (a, b) => a.def.display_order - b.def.display_order || a.def.key.localeCompare(b.def.key),
  );
}

/** Parse a list of raw definition rows, dropping any that are malformed. */
export function parseProductAttributeDefs(rows: readonly unknown[]): ProductAttributeDef[] {
  const out: ProductAttributeDef[] = [];
  for (const raw of rows) {
    const parsed = productAttributeDefSchema.safeParse(raw);
    if (parsed.success) out.push(parsed.data);
  }
  return out.sort((a, b) => a.display_order - b.display_order || a.key.localeCompare(b.key));
}

/* ─────────────────────────────────────────────────────────────────── */
/* Similarity                                                           */
/* ─────────────────────────────────────────────────────────────────── */

/** Per-kind closeness of two values for the SAME attribute, in [0, 1]. */
function attributeCloseness(
  a: ResolvedProductAttribute,
  b: ResolvedProductAttribute,
): number | null {
  if (a.kind !== b.kind) return null;
  switch (a.kind) {
    case "enum":
      return a.value === (b as typeof a).value ? 1 : 0;
    case "boolean":
      return a.value === (b as typeof a).value ? 1 : 0;
    case "range": {
      const other = b as typeof a;
      const span = a.def.range_max - a.def.range_min;
      if (span <= 0) return null;
      // Linear: touching values score 1, opposite ends score 0.
      return 1 - Math.abs(a.value - other.value) / span;
    }
    case "group_list": {
      const other = b as typeof a;
      const flatten = (v: Record<string, string[]>) =>
        new Set(
          Object.values(v)
            .flat()
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean),
        );
      const setA = flatten(a.value);
      const setB = flatten(other.value);
      if (setA.size === 0 || setB.size === 0) return null;
      // Jaccard over the union of every group: two perfumes sharing most of
      // their notes are alike even when the notes sit in different tiers.
      let shared = 0;
      for (const item of setA) if (setB.has(item)) shared += 1;
      return shared / (setA.size + setB.size - shared);
    }
    case "text":
      // Prose is not a similarity signal — comparing two descriptions by
      // string equality would be noise dressed up as data.
      return null;
  }
}

/**
 * How alike two products are, over the attributes the merchant marked
 * comparable. Returns `null` when they share no comparable attribute — the
 * caller then has nothing to rank on and should fall back rather than
 * pretend everything scored zero.
 */
export function attributeSimilarity(
  a: readonly ResolvedProductAttribute[],
  b: readonly ResolvedProductAttribute[],
): number | null {
  const byKey = new Map(b.filter((x) => x.def.is_comparable).map((x) => [x.def.key, x]));

  let total = 0;
  let counted = 0;
  for (const attr of a) {
    if (!attr.def.is_comparable) continue;
    const other = byKey.get(attr.def.key);
    if (!other) continue;
    const score = attributeCloseness(attr, other);
    if (score === null) continue;
    total += score;
    counted += 1;
  }

  return counted === 0 ? null : total / counted;
}
