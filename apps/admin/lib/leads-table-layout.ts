/**
 * Pure layout model + forward-compatible resolver for the configurable Prospects
 * table. No React — imported by BOTH the API route handler and the client hook so
 * the persisted schema and the normalization logic can never drift apart.
 *
 * Persistence: a single `admin_settings` row (key = LEADS_TABLE_LAYOUT_KEY, value
 * JSONB) holds the org-wide layout. There is exactly one shared layout — what a
 * super_admin saves is what every employee sees.
 */

import { z } from "zod";
import {
  LEAD_COLUMN_MAP,
  LEAD_COLUMN_ORDER,
  isLeadColumnId,
  type LeadColumnId,
} from "./leads-table-columns";

export const LEADS_TABLE_LAYOUT_KEY = "leads_table_layout";
export const LEADS_TABLE_LAYOUT_VERSION = 1 as const;

/** Absolute width bounds (px). minWidth per column is enforced on top of MIN. */
export const MIN_COLUMN_WIDTH = 40;
export const MAX_COLUMN_WIDTH = 800;
/** Defensive upper bound on stored entries (we ship 11 columns; allow some dupes). */
const MAX_STORED_COLUMNS = 50;

// ── Resolved (post-merge) shape: ids strict, every shipped column present once ──
export interface ResolvedColumn {
  id: LeadColumnId;
  width: number;
  hidden: boolean;
}
export type ResolvedLayout = ResolvedColumn[];

// ── Persisted shape ──
// id/width are LENIENT on purpose: stored data is an untrusted, possibly-drifted
// boundary. A column removed in a later build, or a width outside today's bounds,
// must NOT nuke the whole saved layout — `resolveLeadLayout` drops/clamps instead.
const storedColumnSchema = z.object({
  id: z.string(),
  width: z.number(),
  hidden: z.boolean(),
});

export const layoutSchema = z
  .object({
    version: z.literal(LEADS_TABLE_LAYOUT_VERSION),
    columns: z.array(storedColumnSchema).min(1).max(MAX_STORED_COLUMNS),
  })
  .strict();

export type LayoutConfig = z.infer<typeof layoutSchema>;

function clampWidth(id: LeadColumnId, w: unknown): number {
  const def = LEAD_COLUMN_MAP[id];
  const n = typeof w === "number" && Number.isFinite(w) ? Math.round(w) : def.defaultWidth;
  return Math.min(MAX_COLUMN_WIDTH, Math.max(def.minWidth, n));
}

/** Clamp an arbitrary candidate width for a single known column (used by resize). */
export function clampColumnWidth(id: LeadColumnId, width: number): number {
  return clampWidth(id, width);
}

export function defaultLayout(): ResolvedLayout {
  return LEAD_COLUMN_ORDER.map((id) => ({
    id,
    width: LEAD_COLUMN_MAP[id].defaultWidth,
    hidden: false,
  }));
}

/**
 * Resolve a stored (or null) config into a canonical layout. This is the single
 * normalization chokepoint — run on every read AND before every write — so the
 * rest of the app can treat its output as fully trusted:
 *   1. null / first-run        → defaults
 *   2. drop unknown / removed ids and de-duplicate (keep first occurrence)
 *   3. clamp widths to [minWidth, MAX]; required columns are force-shown
 *   4. append newly-shipped columns (visible) at the end — zero-migration upgrades
 *   5. force the pinned identity column (merchant) to index 0 and visible
 */
export function resolveLeadLayout(config: LayoutConfig | null): ResolvedLayout {
  if (!config) return defaultLayout();

  const seen = new Set<LeadColumnId>();
  const out: ResolvedColumn[] = [];

  for (const sc of config.columns) {
    if (!isLeadColumnId(sc.id) || seen.has(sc.id)) continue;
    const def = LEAD_COLUMN_MAP[sc.id];
    seen.add(sc.id);
    out.push({
      id: sc.id,
      width: clampWidth(sc.id, sc.width),
      hidden: def.required ? false : Boolean(sc.hidden),
    });
  }

  for (const id of LEAD_COLUMN_ORDER) {
    if (seen.has(id)) continue;
    out.push({ id, width: LEAD_COLUMN_MAP[id].defaultWidth, hidden: false });
  }

  const pinIdx = out.findIndex((c) => LEAD_COLUMN_MAP[c.id].pinnedFirst);
  if (pinIdx > 0) out.unshift(out.splice(pinIdx, 1)[0]);
  if (out[0]) out[0].hidden = false;

  return out;
}

export function serializeLayout(layout: ResolvedLayout): LayoutConfig {
  return {
    version: LEADS_TABLE_LAYOUT_VERSION,
    columns: layout.map(({ id, width, hidden }) => ({ id, width, hidden })),
  };
}

export function visibleColumns(layout: ResolvedLayout): ResolvedLayout {
  return layout.filter((c) => !c.hidden);
}

export function sameLayout(a: ResolvedLayout, b: ResolvedLayout): boolean {
  return (
    a.length === b.length &&
    a.every((c, i) => c.id === b[i].id && c.width === b[i].width && c.hidden === b[i].hidden)
  );
}

/** Shallow clone so an edit-mode working copy never mutates the cached saved layout. */
export function cloneLayout(layout: ResolvedLayout): ResolvedLayout {
  return layout.map((c) => ({ ...c }));
}
