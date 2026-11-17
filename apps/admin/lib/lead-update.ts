import { z } from "zod";
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

const LIST_WORDS: Record<LeadList, string> = { phone_numbers: "phones", tags: "tags", branches: "branches" };

/** "phones and tags", in the form's order; "lists" when none is named. */
function listNames(lists: readonly string[]): string {
  const words = LEAD_LISTS.filter((list) => lists.includes(list)).map((list) => LIST_WORDS[list]);
  return words.length > 0 ? wordList(words) : "lists";
}

/**
 * The lead page's line when its read again finds the lead gone (404): a
 * colleague deleted it while it was open. Asking again cannot bring it back,
 * and a save answers "Lead not found".
 */
export const LEAD_GONE = "This lead was deleted. Changes here can no longer be saved.";

/**
 * "A colleague changed this lead's tags while you had it open. ..." The form
 * then takes their lists in and keeps everything else that was typed.
 */
export function listsChangedText(lists: readonly string[]): string {
  const named = listNames(lists);
  return `A colleague changed this lead's ${named} while you had it open. Nothing was saved. The form now shows their ${named}: make your change to them again, then save.`;
}

/**
 * A resumed draft closed with changes that did not save. The form is gone, so
 * a colleague's clash says to open the draft again, where their lists show.
 */
export function draftNotSavedText(error: Error): string {
  if (error instanceof LeadListsChangedError) {
    return `Your changes to the draft were not saved: a colleague changed its ${listNames(error.lists)} meanwhile. Open the draft again to make them.`;
  }
  return `Couldn't save the draft: ${error.message}`;
}

/** A save refused because a colleague changed these lists since the form opened. */
export class LeadListsChangedError extends Error {
  constructor(
    message: string,
    readonly lists: LeadList[],
  ) {
    super(message);
  }
}

const refusedSaveSchema = z.object({ error: z.string(), stale: z.array(z.enum(LEAD_LISTS)).optional() });

/** The error a refused lead save answers with: the server's words, and the lists that clashed. */
export async function leadSaveRefusal(res: Response, fallback: string): Promise<Error> {
  const body = refusedSaveSchema.safeParse(await res.json().catch(() => null));
  if (!body.success) return new Error(fallback);
  return body.data.stale?.length ? new LeadListsChangedError(body.data.error, body.data.stale) : new Error(body.data.error);
}

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
