// =====================================================================
// COD risk signals — shaping the database's verdict for the order row
// =====================================================================
// `cod_risk_signals` (SQL) is the truth: it runs the same two-axis rule as
// the customers console. This module only turns its JSON into the three
// order fields ops read (risk_metadata, needs_attention, attention_reasons)
// and is deliberately tolerant: a malformed or missing verdict yields "no
// signal", never a blocked checkout.
// =====================================================================

/** The console's two-axis vocabulary (risk_level_calc): clean → caution → high → blocked. */
export type CodRiskLevel = "clean" | "caution" | "high" | "blocked";
/** value_tier_calc: completed orders 0–1 / 2 / 3+. */
export type CodValueTier = "newcomer" | "good" | "vip";

export type CodRiskReason =
  | "high_risk_customer"
  | "duplicate_order"
  | "order_velocity"
  | "address_incomplete";

const REASONS: readonly CodRiskReason[] = [
  "high_risk_customer",
  "duplicate_order",
  "order_velocity",
  "address_incomplete",
];

export type CodRiskMetadata = {
  level: CodRiskLevel;
  reasons: CodRiskReason[];
  is_blacklisted: boolean;
  value_tier: CodValueTier;
  total_orders: number;
  completed_count: number;
  severe_count: number;
  recent_severe_count: number;
  moderate_count: number;
  recent_moderate_count: number;
  open_orders_24h: number;
  orders_last_hour: number;
  duplicate_of_order_id: string | null;
  /** Where the verdict came from — ops can tell a storefront stamp from a manual one. */
  source: "storefront";
  evaluated_at: string;
};

export type CodRiskStamp = {
  risk_metadata: CodRiskMetadata;
  needs_attention: boolean;
  attention_reasons: CodRiskReason[];
};

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function level(v: unknown): CodRiskLevel {
  return v === "caution" || v === "high" || v === "blocked" ? v : "clean";
}

function tier(v: unknown): CodValueTier {
  return v === "good" || v === "vip" ? v : "newcomer";
}

export function isCodRiskReason(v: unknown): v is CodRiskReason {
  return typeof v === "string" && (REASONS as readonly string[]).includes(v);
}

/**
 * The COD-risk reasons among an order's attention reasons, in the order they
 * were stamped. Other reasons (WhatsApp failures, delivery review) share the
 * same column and are left out.
 */
export function codRiskReasonsOf(reasons: readonly string[] | null | undefined): CodRiskReason[] {
  return (reasons ?? []).filter(isCodRiskReason);
}

/** Shape the SQL verdict; null when it is not a verdict at all. */
export function stampCodRisk(verdict: unknown, now: Date = new Date()): CodRiskStamp | null {
  if (!verdict || typeof verdict !== "object") return null;
  const v = verdict as Record<string, unknown>;
  const reasons = Array.isArray(v.reasons)
    ? v.reasons.filter(isCodRiskReason)
    : [];
  const metadata: CodRiskMetadata = {
    level: level(v.level),
    reasons,
    is_blacklisted: v.is_blacklisted === true,
    value_tier: tier(v.value_tier),
    total_orders: num(v.total_orders),
    completed_count: num(v.completed_count),
    severe_count: num(v.severe_count),
    recent_severe_count: num(v.recent_severe_count),
    moderate_count: num(v.moderate_count),
    recent_moderate_count: num(v.recent_moderate_count),
    open_orders_24h: num(v.open_orders_24h),
    orders_last_hour: num(v.orders_last_hour),
    duplicate_of_order_id: typeof v.duplicate_of_order_id === "string" ? v.duplicate_of_order_id : null,
    source: "storefront",
    evaluated_at: now.toISOString(),
  };
  return { risk_metadata: metadata, needs_attention: reasons.length > 0, attention_reasons: reasons };
}

/** Ops-facing labels, Iraqi dialect first. */
export const COD_RISK_REASON_LABELS: Record<CodRiskReason, { ar: string; en: string }> = {
  high_risk_customer: { ar: "زبون عالي الخطورة", en: "High-risk customer" },
  duplicate_order: { ar: "طلب مكرر خلال ٢٤ ساعة", en: "Duplicate order within 24h" },
  order_velocity: { ar: "٣ طلبات بساعة", en: "3 orders in an hour" },
  address_incomplete: { ar: "العنوان ناقص", en: "Address incomplete" },
};
