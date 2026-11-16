import { z } from "zod";

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
 * conversion columns) are not here.
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
