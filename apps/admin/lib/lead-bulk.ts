import { z } from "zod";
import { LEAD_STATUS_CONFIG } from "@/types/leads";
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
  z.object({ action: z.literal("delete"), lead_ids: leadIds }),
]);

export type BulkLeadBody = z.input<typeof bulkLeadSchema>;

/**
 * The route's answer: of the ticked leads, how many it found and how many it
 * really changed. A lead already in that state is found but not changed; a
 * lead someone deleted meanwhile is not found.
 */
export const bulkLeadResultSchema = z.object({ success: z.literal(true), found: z.number(), changed: z.number() });

export type BulkLeadResult = z.infer<typeof bulkLeadResultSchema>;

const leads = (n: number) => (n === 1 ? "1 lead" : `${n} leads`);
const wasWere = (n: number) => (n === 1 ? "1 was" : `${n} were`);

/** What the bar says once a press went through: what changed, and what was so already. */
export function bulkResultText(body: BulkLeadBody, { found, changed }: BulkLeadResult): string {
  const same = found - changed;
  const gone = body.lead_ids.length - found;
  const said: string[] = [];
  switch (body.action) {
    case "change_status": {
      const label = LEAD_STATUS_CONFIG[body.payload.status].label;
      said.push(changed > 0 ? `Marked ${leads(changed)} as ${label}.` : "Nothing changed.");
      if (same > 0) said.push(`${wasWere(same)} ${label} already.`);
      break;
    }
    case "assign_to_me":
      said.push(changed > 0 ? `${leads(changed)} ${changed === 1 ? "is" : "are"} yours now.` : "Nothing changed.");
      if (same > 0) said.push(`${wasWere(same)} yours already.`);
      break;
    case "delete":
      said.push(changed > 0 ? `Deleted ${leads(changed)}.` : "Nothing was deleted.");
      break;
  }
  if (gone > 0) said.push(`${gone === 1 ? "1 no longer exists" : `${gone} no longer exist`}.`);
  return said.join(" ");
}
