/**
 * Where a store link clicked inside the editor preview should open.
 *
 * The preview renders every store link under `/_preview/<tenant>` (its
 * StoreBaseProvider base), but the preview route only serves one editor
 * page per URL and needs the signed `?token=`. Opening such a link as-is
 * lands on "not found" (`/_preview/<tenant>/categories/work`) or on the
 * unauthorized page (no token). Instead we open the REAL storefront page
 * at the same path, rendered from the draft, through /api/draft-view,
 * which checks the same token.
 *
 * Returns null for links that leave the preview (other sites, wa.me, tel:)
 * or when the preview has no token to hand over.
 */
export function draftViewUrlForPreviewLink(
  href: string,
  preview: { origin: string; pathname: string; search: string },
  tenantSlug: string | null | undefined,
): string | null {
  if (!tenantSlug) return null;
  const token = new URLSearchParams(preview.search).get("token");
  if (!token) return null;
  const base = previewBase(preview.pathname);
  if (!base) return null;

  let url: URL;
  try {
    url = new URL(href, preview.origin);
  } catch {
    return null;
  }
  if (url.origin !== preview.origin) return null;
  if (url.pathname !== base && !url.pathname.startsWith(`${base}/`)) return null;

  const path = url.pathname.slice(base.length) || "/";
  const to = `${path}${url.search}${url.hash}`;
  const params = new URLSearchParams({ tenant: tenantSlug, token, to });
  return `/api/draft-view?${params.toString()}`;
}

/** `/_preview/<tenant>` from the preview's own path, or null. */
function previewBase(pathname: string): string | null {
  const m = /^\/_preview\/[^/]+/.exec(pathname);
  return m ? m[0] : null;
}
