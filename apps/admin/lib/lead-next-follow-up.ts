import type { createAdminClient } from "@/lib/admin-supabase";

/**
 * Sets a lead's "next follow-up" to its earliest open follow-up, or to none,
 * after one is added or changed. A failed read or write throws: the lead
 * list would otherwise keep showing the old time with no sign of it.
 */
export async function setNextFollowUp(supabase: ReturnType<typeof createAdminClient>, leadId: string): Promise<void> {
  const { data: earliest, error: earliestError } = await supabase
    .from("lead_follow_ups")
    .select("scheduled_at")
    .eq("lead_id", leadId)
    .eq("is_completed", false)
    .order("scheduled_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (earliestError) throw earliestError;

  const { error: leadError } = await supabase
    .from("leads")
    .update({ next_follow_up_at: earliest?.scheduled_at ?? null })
    .eq("id", leadId);
  if (leadError) throw leadError;
}
