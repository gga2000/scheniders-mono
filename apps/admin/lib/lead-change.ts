import { z } from "zod";
import type { createAdminClient } from "./admin-supabase";
import { MANUAL_LEAD_STATUSES } from "./lead-update";

/**
 * A lead's status and owner change through `admin_change_leads`, for one lead
 * (the lead form) or up to 100 (the bulk bar), so both follow one rule: each
 * lead is locked and compared with what is stored; a real status change
 * writes its history line (and last_contacted_at for "contacted"); a real
 * owner change writes assigned_at, a history line and a reassign_lead row
 * with its own "from", in the same transaction. A converted lead is refused
 * by the database (LEAD_CONVERTED_LOCKED), which the routes turn into a 409.
 * The bulk bar's status press (`bulk`) also writes its one bulk_leads staff
 * log row there, saying how many leads really moved.
 */
export interface LeadChange {
  status?: (typeof MANUAL_LEAD_STATUSES)[number];
  /** Undefined leaves the owner alone; null leaves the lead with no owner. */
  owner?: string | null;
  /** False: refuse with how many leads someone else owns, so the person is asked first. */
  takeOwned?: boolean;
}

const changedSchema = z.object({
  success: z.literal(true),
  found: z.number(),
  status_changed: z.number(),
  moved: z.number(),
});
const refusedSchema = z.object({ success: z.literal(false), error: z.string(), count: z.number().optional() });

export type LeadChangeResult =
  | { ok: true; found: number; statusChanged: number; moved: number }
  | { ok: false; status: 400 | 409; error: string; ownedByOthers?: number };

const REFUSALS: Record<string, { status: 400 | 409; error: string }> = {
  owner_not_staff: { status: 400, error: "A lead can only go to an active staff member." },
  use_convert: { status: 400, error: "A lead becomes converted only through Convert, which links its store." },
  nothing_to_change: { status: 400, error: "Nothing to change" },
  lead_count: { status: 400, error: "Pick between 1 and 100 leads." },
};

export async function changeLeads(
  supabase: ReturnType<typeof createAdminClient>,
  leadIds: string[],
  change: LeadChange,
  actor: { id: string; email?: string | null },
  bulk = false,
): Promise<LeadChangeResult> {
  const { data, error } = await supabase.rpc("admin_change_leads", {
    _lead_ids: leadIds,
    _status: change.status ?? null,
    _set_owner: change.owner !== undefined,
    _owner: change.owner ?? null,
    _take_owned: change.takeOwned ?? true,
    _admin_user_id: actor.id,
    _actor_email: actor.email ?? null,
    _bulk: bulk,
  });
  if (error) throw error;

  const refused = refusedSchema.safeParse(data);
  if (refused.success) return leadChangeRefusal(refused.data);

  const { found, status_changed, moved } = changedSchema.parse(data);
  return { ok: true, found, statusChanged: status_changed, moved };
}

/**
 * An admin_change_leads refusal in words. admin_save_lead passes the same
 * refusals on, so the lead form and the bulk bar say them alike.
 */
export function leadChangeRefusal({ error: code, count }: z.infer<typeof refusedSchema>): Extract<LeadChangeResult, { ok: false }> {
  if (code === "owned_by_others") {
    const n = count ?? 0;
    return {
      ok: false,
      status: 409,
      error: `${n} of these ${n === 1 ? "lead belongs" : "leads belong"} to someone else.`,
      ownedByOthers: n,
    };
  }
  const refusal = REFUSALS[code];
  if (!refusal) throw new Error(`Unexpected refusal from admin_change_leads: ${code}`);
  return { ok: false, ...refusal };
}
