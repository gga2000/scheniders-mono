/**
 * One member of staff's steps, read from the staff log (admin_activity_logs):
 * what the Team member page lists, charts and counts. The Team page's
 * "Actions" column counts the same rows (admin_team_counts).
 */

import { changeTitle } from "@/lib/shop-timeline";
import { wordList } from "@/lib/word-list";
import { LEAD_STATUS_CONFIG, type StaffAction } from "@/types/leads";

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
  support_view_end: "Stopped looking as the merchant",
};

/** Steps on a lead, which the log names by the lead's shop name. */
const LEAD_STEPS = new Set(["delete_lead", "reassign_lead"]);

/** The lead form's fields, in the words the form uses (edit_lead rows name them). */
export const LEAD_FIELD_WORDS: Record<string, string> = {
  merchant_name: "name",
  industry_id: "industry",
  industry_detail: "industry detail",
  platform: "platform",
  platform_url: "page link",
  handle: "handle",
  follower_count: "followers",
  post_count: "posts",
  management_name: "manager's name",
  management_info: "manager details",
  page_phone: "page phone",
  phone_numbers: "phones",
  contact_via_dm: "contact by DM",
  website_url: "website",
  email: "email",
  avg_view_count: "views",
  avg_like_count: "likes",
  avg_comments_count: "comments",
  avg_order_count: "orders",
  address: "address",
  city: "city",
  governorate_code: "governorate",
  is_online_only: "online only",
  branches: "branches",
  priority: "priority",
  tags: "tags",
  source_campaign: "campaign",
  source_medium: "medium",
  is_draft: "draft",
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * A bulk bar press, from the count it really changed (rows since round 6 of
 * the staff console audit; older rows counted every ticked lead, so they keep
 * the general words).
 */
function bulkLeadsText(details: Record<string, unknown> | null): string | null {
  const changed = details?.changed;
  if (typeof changed !== "number") return null;
  const leads = changed === 1 ? "1 lead" : `${changed} leads`;
  if (details?.action === "change_status") {
    const status = Object.entries(LEAD_STATUS_CONFIG).find(([key]) => key === details.status)?.[1].label;
    return status ? `Marked ${leads} as ${status}` : null;
  }
  if (details?.action === "delete") {
    const names = Array.isArray(details.leads)
      ? details.leads.flatMap((lead: unknown) => {
          const name = typeof lead === "object" && lead !== null ? text((lead as { merchant_name?: unknown }).merchant_name) : null;
          return name ? [name] : [];
        })
      : [];
    return names.length > 0 ? `Deleted ${leads}: ${wordList(names, 3)}` : `Deleted ${leads}`;
  }
  return null;
}

/** "Edited a lead: Kawkab Baghdad, was Kawkab (name and phones)". */
function editLeadText(details: Record<string, unknown> | null): string {
  const name = text(details?.merchant_name);
  const was = text(details?.was);
  const fields = Array.isArray(details?.fields)
    ? details.fields.flatMap((field: unknown) => (typeof field === "string" ? [LEAD_FIELD_WORDS[field] ?? field.replace(/_/g, " ")] : []))
    : [];
  const lead = name ? `: ${name}${was && was !== name ? `, was ${was}` : ""}` : "";
  return `Edited a lead${lead}${fields.length > 0 ? ` (${wordList(fields, 4)})` : ""}`;
}

/** The industry Edit row's fields, in the row's words (edited industry rows name them). */
export const INDUSTRY_FIELD_WORDS: Record<string, string> = {
  name: "name",
  name_ar: "Arabic name",
  icon: "icon",
  color: "color",
  avg_order_value_iqd: "average order",
  is_active: "on or off",
};

/** A whole number in the log, or null. */
function count(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

/**
 * A change to the industry list, named: "Edited industry Beauty, was
 * Cosmetics (name and color)". Edit and move rows carry the name since round
 * 11 (migration 20261117141316); older ones say "an industry".
 */
function industryText(details: Record<string, unknown> | null): string | null {
  const name = text(details?.name);
  const industry = name ? `industry ${name}` : "an industry";
  switch (details?.change) {
    case "added":
      return `Added ${industry}`;
    case "removed":
      return `Removed ${industry}`;
    case "switched_off": {
      const leads = count(details.leads_using_it);
      return `Switched off ${industry}${leads ? ` (${leads === 1 ? "1 lead uses" : `${leads} leads use`} it)` : ""}`;
    }
    case "moved": {
      const from = count(details.from_place);
      const to = count(details.to_place);
      return `Moved ${industry}${from && to ? ` from place ${from} to ${to}` : ""}`;
    }
    case "edited": {
      const was = text(details.was);
      const fields = Array.isArray(details.fields)
        ? details.fields.flatMap((field: unknown) => (typeof field === "string" ? [INDUSTRY_FIELD_WORDS[field] ?? field.replace(/_/g, " ")] : []))
        : [];
      return `Edited ${industry}${name && was && was !== name ? `, was ${was}` : ""}${fields.length > 0 ? ` (${wordList(fields, 4)})` : ""}`;
    }
    default:
      return null;
  }
}

/** What the step did, in plain words: the shop's own list's words where it has them. */
export function staffActionText(action: string, details: Record<string, unknown> | null): string {
  if (action === "bulk_leads") {
    const bulk = bulkLeadsText(details);
    if (bulk) return bulk;
  }
  if (action === "edit_lead") return editLeadText(details);
  if (action === "update_settings" && details?.setting === "industries") {
    const industry = industryText(details);
    if (industry) return industry;
  }
  const words = TEAM_WORDS[action] ?? changeTitle(action, details) ?? action.replace(/_/g, " ");
  // The log keeps the lead's name: a deleted lead has no row left to name it.
  const lead = LEAD_STEPS.has(action) ? text(details?.merchant_name) : null;
  return lead ? `${words}: ${lead}` : words;
}

/** A key that holds an id: a uuid in the log says nothing to a reader. */
const ID_KEY = /(^|_)id$/;

/**
 * Up to two of the row's plain values, "days: 7 | rows: 40", for the
 * Activity log and Home's Recent Activity. Ids (session_id, industry_id),
 * lists and empty values are left out; null when nothing is left.
 */
export function staffLogSummary(details: Record<string, unknown> | null): string | null {
  const parts = Object.entries(details ?? {})
    .filter(([key, value]) => !ID_KEY.test(key) && value !== null && value !== undefined && typeof value !== "object")
    .slice(0, 2)
    .map(([key, value]) => `${key.replace(/_/g, " ")}: ${String(value)}`);
  return parts.length > 0 ? parts.join(" | ") : null;
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
