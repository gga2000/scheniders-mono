/**
 * Single source of truth for the configurable Prospects table columns: their
 * stable ids and layout dimensions.
 *
 * PURE — no React/JSX — so the API route handler and the layout resolver can
 * import it without dragging a `"use client"` module into the server bundle.
 * The matching cell renderers (which DO return JSX) live in
 * `components/leads/lead-columns.tsx` and are keyed by the same `LeadColumnId`.
 */

// These ids are PERSISTED FOREVER (in admin_settings JSON). Never rename or
// reuse a value once shipped — add new ones at the end of LEAD_COLUMN_META.
export type LeadColumnId =
  | "merchant"
  | "added_by"
  | "date_added"
  | "platform"
  | "industry"
  | "followers"
  | "ranking"
  | "score"
  | "est_orders"
  | "status"
  | "priority";

export interface LeadColumnMeta {
  readonly id: LeadColumnId;
  /** Header label. Uppercase styling is applied by the <th>, not stored here. */
  readonly label: string;
  /** Hard floor (px) for the resize clamp. */
  readonly minWidth: number;
  /** Width (px) used when there is no stored override. */
  readonly defaultWidth: number;
  /** Identity column (merchant) — can never be hidden. */
  readonly required?: true;
  /** Identity column (merchant) — fixed first data column, outside the reorder zone. */
  readonly pinnedFirst?: true;
  /** The generated <td> stops row-click propagation (e.g. the Added-by hovercard). */
  readonly stopRowClick?: true;
  /** Extra classes for the generated <td>. */
  readonly tdClassName?: string;
}

export const LEAD_COLUMN_META = [
  { id: "merchant", label: "Merchant", minWidth: 200, defaultWidth: 280, required: true, pinnedFirst: true },
  { id: "added_by", label: "Added by", minWidth: 96, defaultWidth: 120, stopRowClick: true },
  { id: "date_added", label: "Date added", minWidth: 120, defaultWidth: 150, tdClassName: "whitespace-nowrap" },
  { id: "platform", label: "Platform", minWidth: 120, defaultWidth: 150 },
  { id: "industry", label: "Industry", minWidth: 130, defaultWidth: 170 },
  { id: "followers", label: "Followers", minWidth: 96, defaultWidth: 120 },
  { id: "ranking", label: "Ranking", minWidth: 110, defaultWidth: 130 },
  { id: "score", label: "Score", minWidth: 110, defaultWidth: 130 },
  { id: "est_orders", label: "Est. Orders", minWidth: 100, defaultWidth: 130 },
  { id: "status", label: "Status", minWidth: 120, defaultWidth: 150 },
  { id: "priority", label: "Priority", minWidth: 110, defaultWidth: 130 },
] as const satisfies readonly LeadColumnMeta[];

/** Canonical (default) order — also the registry's declaration order. */
export const LEAD_COLUMN_ORDER: readonly LeadColumnId[] = LEAD_COLUMN_META.map((c) => c.id);

export const LEAD_COLUMN_MAP: Record<LeadColumnId, LeadColumnMeta> = Object.fromEntries(
  LEAD_COLUMN_META.map((c) => [c.id, c]),
) as Record<LeadColumnId, LeadColumnMeta>;

/**
 * The ONLY string→LeadColumnId narrowing point in the system. Persisted layouts
 * are an untrusted, possibly-drifted boundary (a column may have been removed
 * since the row was written), so every id read from storage is narrowed here.
 */
export function isLeadColumnId(id: string): id is LeadColumnId {
  return Object.prototype.hasOwnProperty.call(LEAD_COLUMN_MAP, id);
}

/** Structural (non-configurable) column widths — selection checkbox + row actions. */
export const CHECKBOX_COL_WIDTH = 44;
export const ACTIONS_COL_WIDTH = 112;
