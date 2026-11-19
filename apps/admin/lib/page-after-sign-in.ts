/**
 * The login page's address parameter that holds the console page staff asked
 * for, so that signing in takes them there instead of Home.
 */
export const NEXT_PAGE = "next";

import { plainPath } from "./plain-path";

/** Any origin of our own: only the path, query and fragment are kept. */
const CONSOLE = "https://console.invalid";

/**
 * Where to go after signing in: the console page in `next`, or Home. Only a
 * page of the console itself is followed: never another site ("//x" and
 * "/\x" are other sites to a browser), the login page, or the API. A path
 * with an encoded letter or slash is not followed either: the middleware
 * sends it on to its plain form (lib/plain-path.ts), which may be either.
 */
export function pageAfterSignIn(next: string | null | undefined): string {
  if (!next?.startsWith("/")) return "/";
  let url: URL;
  try {
    url = new URL(next, CONSOLE);
  } catch {
    // Not an address at all (a broken host after "//"): nothing to follow.
    return "/";
  }
  if (url.origin !== CONSOLE) return "/";
  const page = url.pathname + url.search + url.hash;
  // The page is checked in the form it is returned in, as the browser and the
  // redirect will read it. Reading drops dot segments, so "/..//x" comes back
  // as "//x": another site.
  if (new URL(page, CONSOLE).href !== url.href) return "/";
  if (plainPath(url.pathname) !== url.pathname) return "/";
  // Not the login page, nor an address named like it (none of those is a page).
  if (url.pathname.startsWith("/login") || url.pathname === "/api" || url.pathname.startsWith("/api/")) return "/";
  return page;
}
