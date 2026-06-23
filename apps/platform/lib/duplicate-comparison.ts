import type { Order } from "@/lib/supabase";
import { normalizePhoneForSearch } from "@/lib/order-utils";

export type LikelihoodTier = "high" | "medium" | "low";

export function likelihoodTier(score: number): LikelihoodTier {
  if (score >= 80) return "high";
  if (score >= 60) return "medium";
  return "low";
}

export type SignalKey =
  | "samePhone"
  | "sameName"
  | "sameCity"
  | "sameProduct"
  | "timeDelta";

export interface DuplicateSignal {
  key: SignalKey;
  danger: boolean;
}

export function deriveSignals(
  current: Order,
  nearest: Order | undefined,
): DuplicateSignal[] {
  if (!nearest) return [];
  const signals: DuplicateSignal[] = [];

  const p1 = normalizePhoneForSearch(current.phone);
  const p2 = normalizePhoneForSearch(nearest.phone);
  if ((p1 && p2 && p1 === p2) || current.phone === nearest.phone) {
    signals.push({ key: "samePhone", danger: true });
  }

  const n1 = current.customer_name?.toLowerCase().trim() ?? "";
  const n2 = nearest.customer_name?.toLowerCase().trim() ?? "";
  if (n1 && n1 === n2) signals.push({ key: "sameName", danger: false });

  if (current.city && current.city === nearest.city) {
    signals.push({ key: "sameCity", danger: false });
  }

  const items1 = current.items?.map((i) => i.name.toLowerCase()) ?? [];
  const items2 = nearest.items?.map((i) => i.name.toLowerCase()) ?? [];
  if (items1.some((i) => items2.includes(i))) {
    signals.push({ key: "sameProduct", danger: false });
  }

  signals.push({ key: "timeDelta", danger: false });
  return signals;
}

// Arabic relative time. Moved here from duplicate-comparison-modal.tsx so both
// the modal and the timeline sub-component share one implementation.
export function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "الآن";
  if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  if (diffDays === 1) return "أمس";
  if (diffDays < 7) return `منذ ${diffDays} أيام`;
  return date.toLocaleDateString("ar-IQ", { month: "short", day: "numeric" });
}

export interface CustomerStats {
  totalOrders: number;
  totalSpent: number; // realized: delivered + completed
  deliveredCount: number;
  completedCount: number;
  cancelledCount: number;
  cancelRate: number; // 0..1
}

export function computeCustomerStats(orders: Order[]): CustomerStats {
  let totalSpent = 0;
  let deliveredCount = 0;
  let completedCount = 0;
  let cancelledCount = 0;

  for (const o of orders) {
    if (o.status === "delivered") {
      deliveredCount++;
      totalSpent += Number(o.price) || 0;
    } else if (o.status === "completed") {
      completedCount++;
      totalSpent += Number(o.price) || 0;
    } else if (o.status === "cancelled") {
      cancelledCount++;
    }
  }

  const totalOrders = orders.length;
  return {
    totalOrders,
    totalSpent,
    deliveredCount,
    completedCount,
    cancelledCount,
    cancelRate: totalOrders > 0 ? cancelledCount / totalOrders : 0,
  };
}

export function isRepeatCustomer(stats: CustomerStats): boolean {
  return stats.totalOrders >= 3 && stats.deliveredCount + stats.completedCount >= 1;
}
