// =====================================================================
// Prune orphaned variants (EC20)
// =====================================================================
// Deleting a segment/experiment used to leave behind variants whose `audience`
// / `ab_test` condition references the now-gone id. Variant matching is AND
// ("every condition must match") so such a variant can NEVER match again — the
// merchant's authored override silently stops applying, with no warning and no
// way to see it in the editor. Since the variant is already permanently dead,
// the safe cleanup on delete is to REMOVE it (stripping just the dead condition
// is unsafe: an emptied condition list means "always match", which would
// broaden the override to everyone).
//
// Scope: variants only. A section *visibility* rule referencing a deleted
// segment is a separate, ambiguous case (removing it makes the section always
// visible) and is intentionally left for an explicit merchant decision.
// =====================================================================

import type { PageConfig, Variant } from "./types/store-config-v2";

export interface PruneResult {
  pages: PageConfig[];
  /** How many variants were removed across all pages/sections. */
  removed: number;
}

function prune(
  pages: PageConfig[],
  shouldRemove: (v: Variant) => boolean,
): PruneResult {
  let removed = 0;
  const next = pages.map((page) => ({
    ...page,
    sections: page.sections.map((section) => {
      const variants = section.variants;
      if (!Array.isArray(variants) || variants.length === 0) return section;
      const kept = variants.filter((v) => {
        const drop = shouldRemove(v);
        if (drop) removed += 1;
        return !drop;
      });
      return kept.length === variants.length ? section : { ...section, variants: kept };
    }),
  }));
  return { pages: next, removed };
}

/** Remove variants whose conditions reference a deleted audience segment. */
export function pruneVariantsForDeletedSegment(
  pages: PageConfig[],
  segmentId: string,
): PruneResult {
  return prune(pages, (v) =>
    v.conditions.some((c) => c.kind === "audience" && c.segment_id === segmentId),
  );
}

/** Remove variants whose conditions reference a deleted A/B experiment. */
export function pruneVariantsForDeletedExperiment(
  pages: PageConfig[],
  experimentId: string,
): PruneResult {
  return prune(pages, (v) =>
    v.conditions.some(
      (c) => c.kind === "ab_test" && c.experiment_id === experimentId,
    ),
  );
}
