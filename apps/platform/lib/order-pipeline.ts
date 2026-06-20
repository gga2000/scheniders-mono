import { z } from "zod";

/**
 * Order pipeline widget configuration.
 *
 * The pipeline shows a set of order-status "stages" as a proportional bar.
 * Which stages appear (and in what order) is configurable on two layers:
 *
 *  1. Org default — stored tenant-scoped in `app_settings` under
 *     {@link ORDER_PIPELINE_SETTINGS_KEY}. Set by an admin; the baseline every
 *     employee of the tenant sees.
 *  2. Per-user override — stored in localStorage (see use-order-pipeline-layout).
 *     Lets an individual employee tailor their own view without affecting others.
 *
 * Effective order = userOverride ?? orgDefault ?? DEFAULT_PIPELINE_STAGES.
 */

export const ORDER_PIPELINE_SETTINGS_KEY = "order_pipeline_layout";

/** Every status the pipeline can display. Each maps 1:1 to a key in the
 *  `statusCounts` record the orders page already computes. */
export const PIPELINE_STAGE_IDS = [
    "new",
    "contacted",
    "confirmed",
    "in_transit",
    "delivered",
    "completed",
    "suspended",
    "pending_checkout",
    "no_response",
    "refunds",
    "cancelled",
    "rejected",
] as const;

export type PipelineStageId = (typeof PIPELINE_STAGE_IDS)[number];

export interface PipelineStageMeta {
    id: PipelineStageId;
    /** i18n key for the localized label. */
    labelKey: string;
    /** English fallback when the key is missing. */
    fallback: string;
    /** Segment fill — pastel design-system token or hex; readable in light & dark. */
    fill: string;
}

// Registry of every selectable stage with its colour + label. Order here is the
// order they appear in the customizer's "available" list.
//
// `fill` mirrors the pill/sticky-filter colours from `getStatusBadgeStyle`
// (lib/order-format-utils) so the pipeline reads as the same visual language.
// Tailwind class colours are written as their hex equivalents since the fill is
// applied via inline style. Keep these in sync if getStatusBadgeStyle changes:
//   new→orange-200  contacted→pastel-yellow  confirmed→pastel-green
//   in_transit→blue-200  delivered→pastel-mint  completed→emerald-200
//   no_response→slate-200  cancelled→red-200  rejected→rose-100
//   refunds→rose-200 (return family)  suspended→gray-200 (default)
//   pending_checkout→terracotta accent (#F4B4A6, matches its unique theme)
export const PIPELINE_STAGE_REGISTRY: Record<PipelineStageId, PipelineStageMeta> = {
    new: { id: "new", labelKey: "orders.status.new", fallback: "New", fill: "#FED7AA" },
    contacted: { id: "contacted", labelKey: "orders.status.contacted", fallback: "Contacted", fill: "var(--pastel-yellow)" },
    confirmed: { id: "confirmed", labelKey: "orders.status.confirmed", fallback: "Confirmed", fill: "var(--pastel-green)" },
    in_transit: { id: "in_transit", labelKey: "orders.status.inTransit", fallback: "In Transit", fill: "#BFDBFE" },
    delivered: { id: "delivered", labelKey: "orders.status.delivered", fallback: "Delivered", fill: "var(--pastel-mint)" },
    completed: { id: "completed", labelKey: "orders.status.completed", fallback: "Completed", fill: "#A7F3D0" },
    suspended: { id: "suspended", labelKey: "orders.status.suspended", fallback: "Suspended", fill: "#E5E7EB" },
    pending_checkout: { id: "pending_checkout", labelKey: "orders.status.pendingCheckout", fallback: "Abandoned", fill: "#F4B4A6" },
    no_response: { id: "no_response", labelKey: "orders.status.noResponse", fallback: "No Response", fill: "#E2E8F0" },
    refunds: { id: "refunds", labelKey: "orders.status.refunds", fallback: "Refunds", fill: "#FECDD3" },
    cancelled: { id: "cancelled", labelKey: "orders.status.cancelled", fallback: "Canceled", fill: "#FECACA" },
    rejected: { id: "rejected", labelKey: "orders.status.rejected", fallback: "Rejected", fill: "#FFE4E6" },
};

/** Built-in default: the active fulfilment funnel. */
export const DEFAULT_PIPELINE_STAGES: PipelineStageId[] = [
    "new",
    "contacted",
    "confirmed",
    "in_transit",
    "delivered",
];

const STAGE_ID_SET = new Set<string>(PIPELINE_STAGE_IDS);

/**
 * Coerce arbitrary stored input into a safe, ordered, de-duplicated stage list.
 * Drops unknown ids and duplicates, preserving order. Returns `null` for an
 * empty/invalid result so callers can fall back to the next layer.
 */
export function normalizePipelineStages(input: unknown): PipelineStageId[] | null {
    if (!Array.isArray(input)) return null;
    const seen = new Set<string>();
    const out: PipelineStageId[] = [];
    for (const raw of input) {
        if (typeof raw !== "string" || !STAGE_ID_SET.has(raw) || seen.has(raw)) continue;
        seen.add(raw);
        out.push(raw as PipelineStageId);
    }
    return out.length > 0 ? out : null;
}

/** Zod schema for the persisted org-default payload. */
export const pipelineLayoutSchema = z.object({
    stages: z.array(z.enum(PIPELINE_STAGE_IDS)).max(PIPELINE_STAGE_IDS.length),
});

export type PipelineLayout = z.infer<typeof pipelineLayoutSchema>;
