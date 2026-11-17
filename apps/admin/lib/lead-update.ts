import { z } from "zod";
import type { createAdminClient } from "./admin-supabase";
import { wordList } from "./word-list";

/**
 * Statuses a person may set by hand. "converted" is not one: a lead becomes
 * a store only through the convert step, which links the store and records
 * who closed it for commission. The bulk bar takes the same list.
 */
export const MANUAL_LEAD_STATUSES = ["new", "contacted", "interested", "store_built", "lost"] as const;

const text = z.string().nullable();
const count = z.number().int().min(0);
const phone = z.object({ title: z.string(), number: z.string() });

/**
 * What the lead form and the status menus may change on a lead (PATCH
 * /api/leads/[id]). Every field is optional; unknown fields are dropped.
 * Fields the server keeps (assigned_at, last_contacted_at, scores, the
 * conversion columns) are not here. admin_edit_lead saves all of them but
 * status and owner, and refuses any other key (edit-field-lists.test.ts
 * holds the lists together).
 */
export const leadUpdateSchema = z
  .object({
    merchant_name: z.string(),
    industry_id: z.uuid().nullable(),
    industry_detail: text,
    platform: z.enum([
      "instagram", "facebook", "tiktok", "snapchat", "youtube", "twitter",
      "linkedin", "website", "referral", "cold_call", "other",
    ]),
    platform_url: text,
    handle: text,
    follower_count: count,
    post_count: count,
    management_name: text,
    management_info: text,
    page_phone: text,
    phone_numbers: z.array(phone),
    contact_via_dm: z.boolean(),
    website_url: text,
    email: text,
    avg_view_count: count,
    avg_like_count: count,
    avg_comments_count: count,
    avg_order_count: count,
    address: text,
    city: text,
    governorate_code: text,
    is_online_only: z.boolean(),
    branches: z.array(z.object({ name: z.string(), city: z.string(), address: z.string(), phones: z.array(phone) })),
    priority: z.enum(["low", "medium", "high", "urgent"]),
    assigned_to: z.uuid().nullable(),
    tags: z.array(z.string()).nullable(),
    source_campaign: text,
    source_medium: text,
    status: z.enum(MANUAL_LEAD_STATUSES, {
      error: "A lead becomes converted only through Convert, which links its store.",
    }),
    is_draft: z.boolean(),
  })
  .partial();

export type LeadUpdate = z.infer<typeof leadUpdateSchema>;

/** The lists a save sends whole (phones, tags, branches). */
export const LEAD_LISTS = ["phone_numbers", "tags", "branches"] as const;
export type LeadList = (typeof LEAD_LISTS)[number];

/**
 * The lists a save changes, as the form opened them (`was` on PATCH). They
 * are only compared with what is stored, never saved, so they are taken as
 * they came: a stored phone may hold keys the form does not know.
 */
const listsAsOpenedSchema = z
  .object({
    phone_numbers: z.array(z.unknown()).nullable(),
    tags: z.array(z.unknown()).nullable(),
    branches: z.array(z.unknown()).nullable(),
  })
  .partial()
  .strict();

export type LeadListsAsOpened = z.infer<typeof listsAsOpenedSchema>;

/** PATCH /api/leads/[id]: the changes, and the lists among them as the form opened them. */
export const leadPatchSchema = leadUpdateSchema.extend({ was: listsAsOpenedSchema.optional() });

/** A list as Postgres compares jsonb: no list is an empty one, and key order does not count. */
function listKey(value: unknown): string {
  return JSON.stringify(value ?? [], (_key, v: unknown) =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

/**
 * The lists stored now that are not as the form opened them: a colleague
 * changed them meanwhile. The rule admin_edit_lead applies under the lead's
 * lock (migration 20261117142441); the route reads it first so a save that
 * would be refused saves nothing at all, status and owner included.
 */
export function staleLists(stored: Partial<Record<LeadList, unknown>>, was: LeadListsAsOpened): LeadList[] {
  return LEAD_LISTS.filter((list) => list in was && listKey(stored[list]) !== listKey(was[list]));
}

const LIST_WORDS: Record<LeadList, string> = { phone_numbers: "phones", tags: "tags", branches: "branches" };

/** "A colleague changed this lead's tags while you had it open. ..." */
export function listsChangedText(lists: readonly string[]): string {
  const words = LEAD_LISTS.filter((list) => lists.includes(list)).map((list) => LIST_WORDS[list]);
  const named = words.length > 0 ? wordList(words) : "lists";
  return `A colleague changed this lead's ${named} while you had it open. Nothing was saved. Open the lead again to see their change, then make yours.`;
}

const editedSchema = z.object({ found: z.boolean(), changed: z.array(z.string()), stale: z.array(z.string()).optional() });

/**
 * A colleague removed the industry this lead names while its form was open
 * (admin_remove_industry deletes an industry no lead uses). Said in words,
 * not "Failed to update lead", and the form reads the industries again.
 */
export const INDUSTRY_GONE = "This industry was just removed. Pick another one and save again.";

/** Postgres refused the lead because its industry no longer exists. */
export function isIndustryGone(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = "code" in error ? error.code : undefined;
  const message = "message" in error ? error.message : undefined;
  return code === "23503" && typeof message === "string" && message.includes("leads_industry_id_fkey");
}

/**
 * Save the lead form's fields (everything but status and owner, which go
 * through changeLeads) with `admin_edit_lead`: under a lock it compares each
 * field with what is stored, saves only a real change, and writes one
 * edit_lead staff log row naming the fields that changed, in the same
 * transaction. A save that changes nothing writes nothing. With `was`, a list
 * a colleague changed since the form opened is answered as `stale` and
 * nothing is saved.
 */
export async function editLead(
  supabase: ReturnType<typeof createAdminClient>,
  leadId: string,
  changes: Omit<LeadUpdate, "status" | "assigned_to">,
  actor: { id: string; email?: string | null },
  was: LeadListsAsOpened = {},
): Promise<z.infer<typeof editedSchema>> {
  const { data, error } = await supabase.rpc("admin_edit_lead", {
    _lead_id: leadId,
    _changes: changes,
    _admin_user_id: actor.id,
    _actor_email: actor.email ?? null,
    // Left out when no list is compared: the function's default, no check.
    ...(Object.keys(was).length > 0 ? { _was: was } : {}),
  });
  if (error) throw error;
  return editedSchema.parse(data);
}
