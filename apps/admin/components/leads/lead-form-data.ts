import type { Lead, LeadFormData } from "@/types/leads";
import { LEAD_LISTS, type LeadListsAsOpened } from "@/lib/lead-update";
import { normalizeIraqiPhone } from "./lead-phone";

/**
 * Map a persisted Lead onto the editable form shape — the single source of truth
 * for pre-filling the lead form (detail edit + draft resume, desktop + mobile).
 */
export function leadToFormData(lead: Lead): LeadFormData {
  return {
    merchant_name: lead.merchant_name,
    industry_id: lead.industry_id,
    industry_detail: lead.industry_detail ?? "",
    platform: lead.platform,
    platform_url: lead.platform_url ?? "",
    handle: lead.handle ?? "",
    follower_count: lead.follower_count,
    post_count: lead.post_count,
    management_name: lead.management_name ?? "",
    management_info: lead.management_info ?? "",
    page_phone: lead.page_phone ?? "",
    phone_numbers: lead.phone_numbers,
    contact_via_dm: lead.contact_via_dm,
    website_url: lead.website_url ?? "",
    email: lead.email ?? "",
    avg_view_count: lead.avg_view_count,
    avg_like_count: lead.avg_like_count,
    avg_comments_count: lead.avg_comments_count,
    avg_order_count: lead.avg_order_count,
    address: lead.address ?? "",
    city: lead.city ?? "",
    governorate_code: lead.governorate_code ?? "",
    is_online_only: lead.is_online_only,
    branches: lead.branches ?? [],
    priority: lead.priority,
    assigned_to: lead.assigned_to,
    tags: lead.tags,
    source_campaign: lead.source_campaign ?? "",
    source_medium: lead.source_medium ?? "",
  };
}

/** Placeholder business name for a draft saved before the employee typed one. */
export const DRAFT_PLACEHOLDER_NAME = "Untitled draft";

/** The form as it is saved: trimmed, phones in one shape, and nothing a DM-only or online-only page cannot have. */
export function normalizeLeadForm(form: LeadFormData): LeadFormData {
  return {
    ...form,
    merchant_name: form.merchant_name.trim(),
    industry_detail: form.industry_detail.trim(),
    // Store the handle without a leading "@" (users may type "@name").
    handle: form.handle.trim().replace(/^@+/, ""),
    website_url: form.website_url.trim(),
    email: form.email.trim().toLowerCase(),
    // DM-only pages keep no phone numbers.
    page_phone: form.contact_via_dm || !form.page_phone ? "" : normalizeIraqiPhone(form.page_phone),
    phone_numbers: form.contact_via_dm
      ? []
      : form.phone_numbers
          .map((p) => ({
            title: p.title.trim(),
            number: p.number ? normalizeIraqiPhone(p.number) : "",
          }))
          .filter((p) => p.number || p.title),
    // Online-only pages have no physical location (or branches).
    ...(form.is_online_only ? { address: "", city: "", governorate_code: "", branches: [] } : {}),
    // Trim/normalize branches; drop fully-empty ones and blank phone rows.
    branches: form.is_online_only
      ? []
      : form.branches
          .map((b) => ({
            name: b.name.trim(),
            city: b.city.trim(),
            address: b.address.trim(),
            phones: b.phones
              .map((p) => ({
                title: p.title.trim(),
                number: p.number ? normalizeIraqiPhone(p.number) : "",
              }))
              .filter((p) => p.number || p.title),
          }))
          .filter((b) => b.name || b.city || b.address || b.phones.length > 0),
  };
}

/**
 * The fields a save changes: those whose saved value differs from the form as
 * it opened, both put in the saved shape first. A field nobody touched is
 * never sent, so a colleague's change to it while this form was open stays
 * (round 6: the edit form wrote every field back, owner and priority too).
 */
export function leadFormChanges(opened: LeadFormData, saved: LeadFormData): Partial<LeadFormData> {
  const before = normalizeLeadForm(opened);
  const changes: Partial<LeadFormData> = {};
  const keep = <K extends keyof LeadFormData>(key: K) => {
    if (JSON.stringify(saved[key]) !== JSON.stringify(before[key])) changes[key] = saved[key];
  };
  for (const key of Object.keys(saved) as (keyof LeadFormData)[]) keep(key);
  return changes;
}

/**
 * The lists a save changes (phones, tags, branches), as the form opened them.
 * They are sent whole, so the server compares these with what is stored and
 * refuses the save when a colleague changed one meanwhile (round 11).
 */
export function listsAsOpened(opened: LeadFormData, changes: Partial<LeadFormData>): LeadListsAsOpened {
  return Object.fromEntries(LEAD_LISTS.filter((list) => list in changes).map((list) => [list, opened[list]]));
}
