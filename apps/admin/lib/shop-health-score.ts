import { z } from "zod";
import type { HealthParts } from "@/types/admin";

/** What staff_health_parts answers: what the shop's status, wallet and orders each add to 50. */
const healthPartsSchema = z.object({
  status: z.number().int(),
  wallet: z.number().int(),
  orders: z.number().int(),
}) satisfies z.ZodType<HealthParts>;

/**
 * staff_health_score's sum: 50 plus the parts, kept between 0 and 100. The
 * database keeps it too, for the Merchants health filter and sort (a guard
 * test holds the two together). Reading both on a row worked the parts out
 * twice, since the score calls the parts.
 */
export function healthScore(parts: HealthParts): number {
  return Math.max(0, Math.min(100, 50 + parts.status + parts.wallet + parts.orders));
}

/** A shop's health from its staff_health_parts column: the parts, and the score they make. */
export function shopHealth(parts: unknown): { staff_health_parts: HealthParts; staff_health_score: number } {
  const read = healthPartsSchema.parse(parts);
  return { staff_health_parts: read, staff_health_score: healthScore(read) };
}
