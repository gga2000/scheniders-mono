import { z } from "zod";
import { MANUAL_LEAD_STATUSES } from "./lead-update";

const leadIds = z.array(z.uuid()).min(1, "lead_ids required").max(100, "Max 100 leads per bulk action");

/**
 * What the Leads bulk bar may ask for (POST /api/leads/bulk). The bar's hook
 * is typed from it, so a renamed action fails the type check instead of
 * failing every press.
 */
export const bulkLeadSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("change_status"),
    lead_ids: leadIds,
    payload: z.object({ status: z.enum(MANUAL_LEAD_STATUSES) }),
  }),
  // The person pressing takes the leads; the id comes from the session, never
  // the body. Leads someone else owns move only once the person said so.
  z.object({ action: z.literal("assign_to_me"), lead_ids: leadIds, take_from_others: z.boolean().optional() }),
  z.object({
    action: z.literal("change_priority"),
    lead_ids: leadIds,
    payload: z.object({ priority: z.enum(["low", "medium", "high", "urgent"]) }),
  }),
  z.object({ action: z.literal("delete"), lead_ids: leadIds }),
  z.object({
    action: z.literal("add_tag"),
    lead_ids: leadIds,
    payload: z.object({ tag: z.string().trim().min(1).max(50) }),
  }),
]);

export type BulkLeadBody = z.input<typeof bulkLeadSchema>;
