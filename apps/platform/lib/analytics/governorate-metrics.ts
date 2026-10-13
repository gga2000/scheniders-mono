import { OrderStatus } from "@/types/order";
import { GOVERNORATES, Governorate } from "@/lib/address-validator";

export interface GovernorateStats {
  code: string;
  nameAr: string;
  nameEn: string;
  total: number;
  new: number;
  contacted: number;
  confirmed: number;
  cancelled: number;
  in_transit: number;
  delivered: number;
  rejected: number;
  completed: number;
  no_response: number;
  return_pending: number;
  suspended: number;
  revenue: number;
}

const STATUS_KEYS: OrderStatus[] = [
  "new", "contacted", "confirmed", "cancelled", "in_transit",
  "delivered", "rejected", "completed", "no_response",
  "return_pending", "suspended",
];

function emptyStats(gov: Governorate): GovernorateStats {
  return {
    code: gov.code,
    nameAr: gov.alternativeName || gov.nameAr,
    nameEn: gov.nameEn,
    total: 0,
    new: 0,
    contacted: 0,
    confirmed: 0,
    cancelled: 0,
    in_transit: 0,
    delivered: 0,
    rejected: 0,
    completed: 0,
    no_response: 0,
    return_pending: 0,
    suspended: 0,
    revenue: 0,
  };
}

export interface GovernorateMetricsResult {
  governorates: GovernorateStats[];
  unknownCount: number;
}

/**
 * The fields the map reads. Full `Order` rows satisfy it, and so do the dashboard's
 * server-read geo facts, which carry only these columns. `price` is absent for
 * viewers not entitled to money, so their revenue stays 0 and is never shown.
 */
export interface GovernorateOrder {
  status: string;
  price?: number | null;
  governorate_code?: string | null;
  validated_governorate_code?: string | null;
}

export function calculateGovernorateMetrics(orders: GovernorateOrder[]): GovernorateMetricsResult {
  // Initialize all governorates with zero counts
  const statsMap = new Map<string, GovernorateStats>();
  for (const gov of GOVERNORATES) {
    statsMap.set(gov.code, emptyStats(gov));
  }

  let unknownCount = 0;

  // Aggregate orders
  for (const order of orders) {
    const code = order.validated_governorate_code || order.governorate_code;
    if (!code) { unknownCount++; continue; }

    const stats = statsMap.get(code);
    if (!stats) { unknownCount++; continue; }

    stats.total++;
    const status = order.status as OrderStatus;
    if (STATUS_KEYS.includes(status) && status in stats) {
      (stats as unknown as Record<string, number>)[status]++;
    }
    if (status === "delivered" || status === "completed") {
      stats.revenue += Number(order.price ?? 0);
    }
  }

  return { governorates: Array.from(statsMap.values()), unknownCount };
}
