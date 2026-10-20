// =====================================================================
// Is this store taking orders right now?
// =====================================================================
// One rule for every server path that creates or grows an order — the
// checkout and the post-purchase upsell — so a store an admin has paused
// cannot keep accepting order lines through a side door.
// =====================================================================

export interface TenantOrderGateRow {
  status: string;
  restrictions: {
    paused_until?: string | null;
    reason?: string | null;
    blocks?: { new_orders?: boolean };
  } | null;
}

/** Why the store is not taking orders (a shopper-facing Arabic message), or
 *  null when it is. */
export function tenantOrderBlock(tenant: TenantOrderGateRow, nowMs: number = Date.now()): string | null {
  if (
    tenant.status !== "active" &&
    tenant.status !== "trial" &&
    tenant.status !== "limited"
  ) {
    return "المتجر غير نشط حالياً";
  }

  // Tenant pause guard — when admin paused the merchant with new_orders blocked,
  // refuse the order. An expired pause window is treated as inactive.
  if (tenant.status === "limited") {
    const restrictions = tenant.restrictions ?? null;
    const pausedUntil = restrictions?.paused_until
      ? Date.parse(restrictions.paused_until)
      : null;
    // Lift the pause ONLY for a valid timestamp that is in the past. A missing
    // OR unparseable (NaN) end date fails CLOSED — the store stays paused —
    // rather than letting a malformed `paused_until` silently accept orders.
    const stillPaused =
      pausedUntil === null ||
      Number.isNaN(pausedUntil) ||
      pausedUntil > nowMs;
    if (stillPaused && restrictions?.blocks?.new_orders) {
      return restrictions.reason || "المتجر متوقف مؤقتاً عن استقبال الطلبات";
    }
  }
  return null;
}
