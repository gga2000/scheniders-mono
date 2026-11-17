import { z } from "zod";
import type { createAdminClient } from "./admin-supabase";

const answerSchema = z.object({
  removed: z.array(z.object({ id: z.string(), merchant_name: z.string() })),
  kept_with_store: z.array(z.string()),
  kept_converted: z.array(z.string()),
});

export type LeadsDeleted = z.infer<typeof answerSchema>;

/**
 * Delete leads through `admin_delete_leads`: one transaction deletes them and
 * writes the staff log row, which is all that remains of a deleted lead (its
 * history goes with it). A lead with a prospect store is never deleted and is
 * named back in `kept_with_store`; nor is a lead that became a shop (its sale
 * and commission stay on record), named in `kept_converted`. `bulk` picks the
 * row: one `bulk_leads` row for ticked leads, a `delete_lead` row for a lead
 * deleted from its page.
 */
export async function deleteLeads(
  supabase: ReturnType<typeof createAdminClient>,
  leadIds: string[],
  actor: { id: string; email?: string | null },
  bulk: boolean,
): Promise<LeadsDeleted> {
  const { data, error } = await supabase.rpc("admin_delete_leads", {
    _lead_ids: leadIds,
    _admin_user_id: actor.id,
    _actor_email: actor.email ?? null,
    _bulk: bulk,
  });
  if (error) throw error;
  return answerSchema.parse(data);
}
