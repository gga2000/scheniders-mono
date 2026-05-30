import type { AdminTenant } from "@/types/admin";

/**
 * Returns true when a merchant has a state that warrants admin attention.
 * Mirrors the logic in MerchantAlertFlag so the "Needs Attention" filter pill
 * matches the per-card warning indicators.
 */
export function needsAttention(merchant: AdminTenant): boolean {
  const status = (merchant as { status?: string }).status;

  if (status === "suspended" || status === "cancelled") return true;

  if (status === "trial") {
    const trialEnd = (merchant as { trial_ends_at?: string | null }).trial_ends_at;
    if (trialEnd) {
      const daysLeft = Math.ceil(
        (new Date(trialEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      if (daysLeft <= 3) return true;
    }
  }

  const balance = (merchant as { wallet?: { balance_iqd?: number } }).wallet?.balance_iqd ?? 0;
  const orders = (merchant as { usage?: { orders_count?: number } }).usage?.orders_count ?? 0;
  if (balance < 5000 && orders === 0) return true;

  return false;
}
