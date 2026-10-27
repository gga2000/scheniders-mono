import { verifyPreviewToken } from "@scheniders/shared/preview-token";

/** Literal token accepted only when no secret is configured AND the build
 *  is not production, so a local storefront previews without the platform
 *  running. Production with no secret fails closed. */
export const DEV_PREVIEW_TOKEN = "dev-preview-token";

/**
 * True when `token` grants preview access to `tenantId`'s unpublished
 * draft. Production path: an HMAC-signed token (PREVIEW_TOKEN_SECRET)
 * whose `tenant_id` claim matches the resolved tenant and has not
 * expired — a token minted for tenant A never opens tenant B's draft.
 * Shared by the editor preview route and the storefront draft view so
 * both gates are the same gate.
 */
export function canPreviewDraft(
  token: string | null | undefined,
  tenantId: string,
): boolean {
  if (!token) return false;
  const secret = process.env.PREVIEW_TOKEN_SECRET;
  if (secret) {
    const result = verifyPreviewToken(token, secret);
    return result.ok && result.payload.tenant_id === tenantId;
  }
  if (process.env.NODE_ENV === "production") return false;
  return token === DEV_PREVIEW_TOKEN;
}
