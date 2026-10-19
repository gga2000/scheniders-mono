import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { canPreviewDraft } from "@/lib/preview-access";
import { DRAFT_VIEW_COOKIE, getTenantForPreview } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  tenant: z.string().min(1),
  token: z.string().min(1).optional(),
  /** Same-origin path to land on. Anything else falls back to "/". */
  to: z.string().optional(),
  /** "1" leaves draft view and returns to the published store. */
  off: z.literal("1").optional(),
});

/** How long one draft-view session lasts; the token's own expiry (checked
 *  on every request) still wins when it is sooner. */
const DRAFT_VIEW_MAX_AGE_SECONDS = 60 * 60;

/** A relative, same-origin path — never "//host" or "/\host", which
 *  browsers treat as protocol-relative (an open redirect). */
function safePath(to: string | undefined): string {
  if (!to || !to.startsWith("/") || to.startsWith("//") || to.startsWith("/\\")) {
    return "/";
  }
  return to;
}

/**
 * GET /api/draft-view?tenant={slug}&token={preview token}&to={path}
 *
 * Opens the REAL storefront rendered from the tenant's unpublished draft
 * (header, promo bar, hydrated product and all) for whoever holds a valid
 * preview token — the same gate as the editor's /_preview route. Stores the
 * token in an httpOnly cookie; `getTenantBySlug` re-verifies it against the
 * resolved tenant on every request. `?off=1` clears it.
 */
export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }
  const { tenant: slug, token, to, off } = parsed.data;
  const target = new URL(safePath(to), req.nextUrl.origin);

  if (off) {
    const res = NextResponse.redirect(target, 303);
    res.cookies.delete(DRAFT_VIEW_COOKIE);
    return res;
  }

  const tenant = await getTenantForPreview(slug);
  if (!tenant || !canPreviewDraft(token, tenant.id)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const res = NextResponse.redirect(target, 303);
  res.cookies.set(DRAFT_VIEW_COOKIE, token ?? "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DRAFT_VIEW_MAX_AGE_SECONDS,
  });
  return res;
}
