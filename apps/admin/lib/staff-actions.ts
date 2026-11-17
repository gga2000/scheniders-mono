/**
 * One member of staff's steps, read from the staff log (admin_activity_logs):
 * what the Team member page lists, charts and counts. The Team page's
 * "Actions" column counts the same rows (admin_team_counts).
 */

import { changeTitle } from "@/lib/shop-timeline";
import type { StaffAction } from "@/types/leads";

/**
 * Rows under a person's id that are not their own step: a note that names
 * them (written under the colleague it names) and the end of a
 * look-as-the-merchant visit, already counted when it started.
 */
const NOT_OWN_STEPS = ["mention_in_note", "support_view_end"] as const;

/** For `.filter("action", "not.in", ...)`: the API writes a list as "(a,b)". */
export const NOT_OWN_STEPS_LIST = `(${NOT_OWN_STEPS.join(",")})`;

export const STAFF_LOG_COLUMNS = "id, action, tenant_id, details, created_at, tenant:tenants(business_name)";

export interface StaffLogRow {
  id: string;
  action: string;
  tenant_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  tenant: { business_name: string | null } | { business_name: string | null }[] | null;
}

/** Steps the shop's own list has no words for, or leaves out. */
const TEAM_WORDS: Record<string, string> = {
  add_note: "Wrote a note",
  convert_lead: "Turned a lead into a shop",
  build_store_for_lead: "Built a store for a lead",
  delete_lead: "Deleted a lead",
  reassign_lead: "Moved a lead to another owner",
  import_leads: "Imported leads",
  bulk_leads: "Changed several leads at once",
  export_data: "Downloaded a list",
  approve_topup_request: "Approved a payment",
  update_settings: "Changed console settings",
  grant_admin_access: "Gave a colleague console access",
  remove_admin_access: "Took away a colleague's console access",
  update_commission_config: "Changed the commission rules",
  link_prime: "Linked a shop to Prime",
};

/** Steps on a lead, which the log names by the lead's shop name. */
const LEAD_STEPS = new Set(["delete_lead", "reassign_lead"]);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** What the step did, in plain words: the shop's own list's words where it has them. */
export function staffActionText(action: string, details: Record<string, unknown> | null): string {
  const words = TEAM_WORDS[action] ?? changeTitle(action, details) ?? action.replace(/_/g, " ");
  // The log keeps the lead's name: a deleted lead has no row left to name it.
  const lead = LEAD_STEPS.has(action) ? text(details?.merchant_name) : null;
  return lead ? `${words}: ${lead}` : words;
}

export function toStaffAction(row: StaffLogRow): StaffAction {
  const tenant = Array.isArray(row.tenant) ? row.tenant[0] ?? null : row.tenant;
  return {
    id: row.id,
    action: row.action,
    text: staffActionText(row.action, row.details),
    shop: row.tenant_id ? { id: row.tenant_id, name: tenant?.business_name ?? null } : null,
    created_at: row.created_at,
  };
}
