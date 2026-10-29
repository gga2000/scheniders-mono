// The «رحلة العطر» data: the product's own merchant-defined attributes,
// picked by key. A group_list becomes the stages (in the merchant's group
// order), enum / group_list keys become chip rows, a text key becomes the
// one staying-power line. Nothing is derived or scored, and a numeric range
// is never read — the block has no meters by construction.

import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode, ResolvedProductAttribute } from "@scheniders/shared";

export interface ScentJourneyConfig {
  pyramid_key: string;
  chip_keys?: string[];
  note_key?: string;
}

export interface JourneyStage {
  key: string;
  label: string;
  notes: string[];
}

export interface JourneyChipRow {
  key: string;
  label: string;
  chips: string[];
}

export interface ScentJourney {
  stages: JourneyStage[];
  chipRows: JourneyChipRow[];
  note: { label: string; text: string } | null;
}

type GroupListAttribute = Extract<ResolvedProductAttribute, { kind: "group_list" }>;

function stagesOf(attr: GroupListAttribute, locale: LocaleCode): JourneyStage[] {
  return attr.def.group_keys.flatMap((g) => {
    const notes = attr.value[g.key] ?? [];
    if (notes.length === 0) return [];
    return [{ key: g.key, label: resolveI18n(g.label_i18n, locale) || g.key, notes }];
  });
}

/** One attribute as a chip row: an enum is one chip, a group_list is every
 *  value across its groups (null when empty); any other kind is null.
 *  Exported for the scent card, which shows the same rows. */
export function chipRowOf(attr: ResolvedProductAttribute, locale: LocaleCode): JourneyChipRow | null {
  const label = resolveI18n(attr.def.name_i18n, locale) || attr.def.key;
  if (attr.kind === "enum") {
    const chip = resolveI18n(attr.option.label_i18n, locale) || attr.value;
    return { key: attr.def.key, label, chips: [chip] };
  }
  if (attr.kind === "group_list") {
    const chips = attr.def.group_keys.flatMap((g) => attr.value[g.key] ?? []);
    return chips.length > 0 ? { key: attr.def.key, label, chips } : null;
  }
  return null;
}

export function buildScentJourney(
  attributes: readonly ResolvedProductAttribute[] | undefined,
  config: ScentJourneyConfig,
  locale: LocaleCode,
): ScentJourney | null {
  const byKey = new Map<string, ResolvedProductAttribute>(
    (attributes ?? []).map((a) => [a.def.key, a]),
  );

  const pyramid = byKey.get(config.pyramid_key);
  const stages = pyramid && pyramid.kind === "group_list" ? stagesOf(pyramid, locale) : [];

  const chipRows = (config.chip_keys ?? []).flatMap((k) => {
    const attr = byKey.get(k);
    const row = attr ? chipRowOf(attr, locale) : null;
    return row ? [row] : [];
  });

  const noteAttr = config.note_key ? byKey.get(config.note_key) : undefined;
  const noteText =
    noteAttr && noteAttr.kind === "text" ? resolveI18n(noteAttr.value, locale).trim() : "";
  const note =
    noteAttr && noteText
      ? { label: resolveI18n(noteAttr.def.name_i18n, locale) || noteAttr.def.key, text: noteText }
      : null;

  if (stages.length === 0 && chipRows.length === 0 && !note) return null;
  return { stages, chipRows, note };
}
