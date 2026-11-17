import { z } from "zod";
import type { createAdminClient } from "./admin-supabase";
import { leadChangeRefusal, type LeadChange } from "./lead-change";
import { LEAD_LISTS, listsChangedText, type LeadList, type LeadListsAsOpened, type LeadUpdate } from "./lead-update";

/** The lead form's save: status and owner, the other fields, and the lists as the form opened them. */
export interface LeadSave {
  status?: LeadChange["status"];
  /** Undefined leaves the owner alone; null leaves the lead with no owner. */
  owner?: string | null;
  changes: Omit<LeadUpdate, "status" | "assigned_to">;
  was: LeadListsAsOpened;
}

/** A refusal names the lists a colleague changed meanwhile (`stale`), so the form can take theirs in. */
export type LeadSaveResult = { ok: true } | { ok: false; status: 400 | 404 | 409; error: string; stale?: LeadList[] };

const savedSchema = z.object({ success: z.literal(true) });
const refusedSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  count: z.number().optional(),
  stale: z.array(z.enum(LEAD_LISTS)).optional(),
});

/**
 * Save the lead form with `admin_save_lead`, in one transaction under one
 * lock on the lead (migration 20261117162038). A list a colleague changed
 * since the form opened is refused before anything is written. Status and
 * owner then follow the bulk bar's rule (admin_change_leads), and the other
 * fields are saved only where they really changed, each with its history
 * line and staff log row (admin_edit_lead). A refusal writes nothing, and an
 * error (a converted lead, an industry removed meanwhile) undoes the whole
 * save, so the answer always says what happened.
 */
export async function saveLead(
  supabase: ReturnType<typeof createAdminClient>,
  leadId: string,
  save: LeadSave,
  actor: { id: string; email?: string | null },
): Promise<LeadSaveResult> {
  const { data, error } = await supabase.rpc("admin_save_lead", {
    _lead_id: leadId,
    _status: save.status ?? null,
    _set_owner: save.owner !== undefined,
    _owner: save.owner ?? null,
    _changes: save.changes,
    // Left out when no list is compared: the function's default, no check.
    ...(Object.keys(save.was).length > 0 ? { _was: save.was } : {}),
    _admin_user_id: actor.id,
    _actor_email: actor.email ?? null,
  });
  if (error) throw error;

  const refused = refusedSchema.safeParse(data);
  if (refused.success) {
    const { error: code, stale } = refused.data;
    if (code === "not_found") return { ok: false, status: 404, error: "Lead not found" };
    if (code === "stale") return { ok: false, status: 409, error: listsChangedText(stale ?? []), stale: stale ?? [] };
    const { status, error: words } = leadChangeRefusal(refused.data);
    return { ok: false, status, error: words };
  }
  savedSchema.parse(data);
  return { ok: true };
}
