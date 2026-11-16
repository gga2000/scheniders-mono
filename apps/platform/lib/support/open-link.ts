/**
 * A push about support ("we replied", "we solved it") opens the app at
 * `/?support=open` (supabase/functions/send-order-push). The support sheet
 * opens itself for that link and takes the marker out of the address, so a
 * reload or a shared link does not open it again.
 */
export const SUPPORT_OPEN_PARAM = "support";

/** The address without the marker, or null when the address has no marker. */
export function takeSupportOpenLink(href: string): string | null {
    const url = new URL(href);
    if (url.searchParams.get(SUPPORT_OPEN_PARAM) !== "open") return null;
    url.searchParams.delete(SUPPORT_OPEN_PARAM);
    return `${url.pathname}${url.search}${url.hash}`;
}
