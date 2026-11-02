/** Where a merchant's custom domain must point. One source for the dialog's DNS hint and the verifier. */
export const CUSTOM_DOMAIN_CNAME_TARGET = "cname.vercel-dns.com";

const VERCEL_DNS_SUFFIX = ".vercel-dns.com";

const HOSTNAME =
    /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * A pasted domain reduced to a bare lowercase hostname, or null when it is not
 * one. Strips scheme, path, query, port and a trailing dot; rejects anything
 * else (spaces, underscores, IP addresses, single labels).
 */
export function normalizeCustomDomain(input: string): string | null {
    const host = input
        .trim()
        .toLowerCase()
        .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
        .replace(/[/?#].*$/, "")
        .replace(/:\d+$/, "")
        .replace(/\.$/, "");
    return HOSTNAME.test(host) ? host : null;
}

/** Exact match on the Scheniders target (or Vercel's DNS zone) — never a substring, so `evil-scheniders.com.attacker.net` fails. */
export function isAcceptedCnameTarget(record: string): boolean {
    const r = record.trim().toLowerCase().replace(/\.$/, "");
    return r === CUSTOM_DOMAIN_CNAME_TARGET || r.endsWith(VERCEL_DNS_SUFFIX);
}
