import { cookies } from "next/headers";
import { canPreviewDraft } from "./preview-access";

/** httpOnly cookie holding a preview token; set by /api/draft-view. */
export const DRAFT_VIEW_COOKIE = "sb_draft_view";

/**
 * True when THIS request is a draft-view session for `tenantId`: the
 * `sb_draft_view` cookie carries a preview token that still verifies
 * against the tenant (same gate as the editor preview — HMAC + tenant
 * claim + expiry). Read server-side only, so a shopper cannot claim it.
 *
 * A draft-view visitor is the merchant (or someone they shared the token
 * with) looking at unpublished changes, never a real shopper. Anything
 * that reports traffic to the merchant's ad accounts or experiment
 * results — browser pixels, experiment exposure, server-side Purchase
 * events — must stay silent for it.
 */
export async function isDraftViewRequest(tenantId: string): Promise<boolean> {
  const token = (await cookies()).get(DRAFT_VIEW_COOKIE)?.value;
  return canPreviewDraft(token, tenantId);
}
