import { z } from "zod";

/**
 * "View as merchant", look only. Each staff member has one viewer sign-in on
 * the merchant app (support_viewer_users), flagged support_viewer in its auth
 * app_metadata. A 30-minute session (support_view_sessions) points it at one
 * shop; the database refuses every write it tries.
 * Migration 20261116112543_support_view_as.sql.
 */

/** The viewer sign-in's address: never a real inbox, the link is made here. */
export function supportViewerEmail(adminId: string): string {
  return `support-viewer-${adminId}@usefermi.com`;
}

/** Where the merchant app opens after the one-time sign-in link. */
export const SUPPORT_VIEW_OPEN_PATH = "/orders";

export function supportViewUrl(platformUrl: string, hashedToken: string): string {
  const url = new URL("/api/auth/confirm", platformUrl);
  url.searchParams.set("token_hash", hashedToken);
  url.searchParams.set("type", "magiclink");
  url.searchParams.set("next", SUPPORT_VIEW_OPEN_PATH);
  return url.toString();
}

export const StartSupportViewSchema = z.object({ tenantId: z.string().uuid() });

export const SUPPORT_VIEW_REFUSALS: Record<string, { status: number; error: string }> = {
  support_view_unguarded: {
    status: 503,
    error: "View as merchant is off: a database table is not locked yet. Tell the developers.",
  },
  support_view_not_your_viewer: { status: 409, error: "Your viewer sign-in does not match. Try again." },
  support_shop_not_found: { status: 404, error: "This shop no longer exists." },
};
