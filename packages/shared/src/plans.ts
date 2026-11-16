// =====================================================================
// The plans, in the words merchants and staff see (Fermi B1)
// =====================================================================
// Prices, fees and limits live in the database (plan_limits) and are read
// from there; nothing here is a price. What lives here is the one thing the
// database keys cannot say: the names. The keys stay as they were when the
// plans had other names (renaming an enum value touches every function and
// policy that names it), so:
//
//   starter       -> Start / البداية
//   growth        -> Team / الفريق
//   professional  -> Business / الأعمال
//   enterprise    -> Custom / خاص       (by agreement, staff assign it)
//   internal      -> Internal / داخلي   (Ali's own store, never sold)
// =====================================================================

export const PLAN_KEYS = ["starter", "growth", "professional", "enterprise", "internal"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export const PLAN_NAMES: Record<PlanKey, { ar: string; en: string }> = {
    starter: { ar: "البداية", en: "Start" },
    growth: { ar: "الفريق", en: "Team" },
    professional: { ar: "الأعمال", en: "Business" },
    enterprise: { ar: "خاص", en: "Custom" },
    internal: { ar: "داخلي", en: "Internal" },
};

export function isPlanKey(value: string | null | undefined): value is PlanKey {
    return !!value && (PLAN_KEYS as readonly string[]).includes(value);
}

/** The plan's name in the given language; an unknown key is shown as it is. */
export function planName(plan: string | null | undefined, locale: "ar" | "en"): string {
    if (!isPlanKey(plan)) return plan ?? "";
    return PLAN_NAMES[plan][locale];
}

/**
 * What a month costs a shop on a plan for a number of delivered orders: the
 * monthly price plus the fee on each delivered order. Returns and cancelled
 * orders cost nothing, and WhatsApp messages are paid from the wallet apart.
 */
export function monthlyTotal(plan: { base_price_iqd: number; order_price_iqd: number }, deliveredOrders: number): number {
    const orders = Number.isFinite(deliveredOrders) ? Math.max(0, Math.floor(deliveredOrders)) : 0;
    return plan.base_price_iqd + plan.order_price_iqd * orders;
}
