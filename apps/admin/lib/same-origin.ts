/**
 * Whether a request that changes something came from the console's own pages.
 *
 * The console's API trusts the staff sign-in cookie. Without this check, a
 * page on another site that a signed-in staff member opens could send a
 * write with that cookie. Browsers name the page a write came from in the
 * Origin header (and say same-origin or cross-site in Sec-Fetch-Site), and a
 * page cannot change either, so a write is let through only when the page
 * was the console's own. Reads (GET, HEAD, OPTIONS) change nothing.
 */
const READS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isOwnPageWrite(method: string, headers: Headers, host: string): boolean {
  if (READS.has(method.toUpperCase())) return true;

  const origin = headers.get("origin");
  if (origin !== null) {
    // "null" comes from sandboxed frames and privacy redirects: no page to trust.
    if (!URL.canParse(origin)) return false;
    return new URL(origin).host === host;
  }
  // Older browsers leave Origin off same-origin writes but say where the
  // request came from here. A request with neither came from no browser page.
  return headers.get("sec-fetch-site") === "same-origin";
}

export const CROSS_SITE_WRITE = "This change did not come from the staff console, so it was refused.";

/**
 * Whether a read that does something (the export starts a download and writes
 * a staff-log row) was asked for by the console's own page, or typed by the
 * person ("none": the address bar or a bookmark). A link, image or frame on
 * another site sends "cross-site", so it cannot start one with the staff
 * cookie. A request with no Sec-Fetch-Site came from no browser page.
 */
export function isOwnPageRead(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site");
  return site === "same-origin" || site === "none";
}

export const CROSS_SITE_READ = "This download did not start from the staff console, so it was refused.";
