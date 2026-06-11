import type { Lead, LeadFormData } from "@/types/leads";

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
