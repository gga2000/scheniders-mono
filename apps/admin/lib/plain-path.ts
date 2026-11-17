/** Letters, digits and "-._~", percent-encoded (RFC 3986 2.3). */
const ENCODED_UNRESERVED = /%(?:[46][1-9A-F]|[57][0-9A]|3[0-9]|2D|2E|5F|7E)/gi;
/** "/" and "\", percent-encoded. */
const ENCODED_SLASH = /%(?:2F|5C)/gi;

const decode = (encoded: string) => String.fromCharCode(Number.parseInt(encoded.slice(1), 16));

/**
 * The plain form of an address's path. Next.js reads a path decoded to find
 * its page, then loads the page by the path as sent: "/%6Ceads" finds Leads,
 * fails to load it, and answers 500 with an error to Sentry. So the console
 * sends the browser to the plain path first.
 *
 * An encoded letter, digit or "-._~" means the character itself (RFC 3986
 * 6.2.2.2). No console page has an encoded slash in its path either, so in a
 * page's path "%2F" and "%5C" are slashes too. An API path keeps its encoded
 * slashes: they may be part of an id, and each route checks its own.
 */
export function plainPath(pathname: string): string {
  const plain = pathname.replace(ENCODED_UNRESERVED, decode);
  return plain.startsWith("/api/") ? plain : plain.replace(ENCODED_SLASH, decode);
}
