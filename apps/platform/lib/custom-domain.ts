/**
 * Where a merchant's custom domain must point. One source for the dialog's DNS
 * hint and the verifier. A subdomain (shop.example.com) takes a CNAME; an apex
 * (example.com) cannot hold a CNAME, so it takes an A record instead. Both are
 * Vercel's generic, project-independent values (its domain config lists them
 * as accepted alongside the project-specific ones).
 */
export const CUSTOM_DOMAIN_CNAME_TARGET = "cname.vercel-dns.com";
export const CUSTOM_DOMAIN_A_RECORD = "76.76.21.21";

/**
 * Every IPv4 Vercel's domain config recommends for an apex
 * (GET /v6/domains/<d>/config → recommendedIPv4, checked 2026-11-08). A
 * merchant who copied the newer pair from another guide is routed too.
 */
const VERCEL_APEX_IPS: ReadonlySet<string> = new Set([CUSTOM_DOMAIN_A_RECORD, "216.150.1.1", "216.150.16.1"]);

/**
 * Two-label public suffixes merchants here actually register under, so
 * `shop.com.iq` reads as an apex and not as a subdomain of `com.iq`.
 */
const TWO_LABEL_SUFFIXES: ReadonlySet<string> = new Set([
    "com.iq", "net.iq", "org.iq", "edu.iq", "gov.iq",
    "com.sa", "com.tr", "com.eg", "com.jo", "com.kw", "com.qa", "com.bh", "com.om", "co.uk",
]);

/** The TXT record that proves a store owns its domain: `<prefix>.<domain>` holding `<value prefix><token>`. */
export const DOMAIN_TXT_PREFIX = "_scheniders";
const TXT_VALUE_PREFIX = "scheniders-verify=";

export function domainTxtName(domain: string): string {
    return `${DOMAIN_TXT_PREFIX}.${domain}`;
}

export function domainTxtValue(token: string): string {
    return `${TXT_VALUE_PREFIX}${token}`;
}

/** Whether DNS TXT answers (each split into chunks, as Node returns them) hold this store's token. */
export function txtRecordsProve(records: string[][], token: string): boolean {
    const want = domainTxtValue(token);
    return records.some((chunks) => chunks.join("").trim() === want);
}

/**
 * A CNAME target inside Vercel's DNS: the generic `cname.vercel-dns.com`, or a
 * project-specific one such as `497c02790ff6f357.vercel-dns-017.com` (what
 * Vercel's dashboard hands out now). Anchored at both ends, so a lookalike
 * like `cname.vercel-dns.com.attacker.net` never matches.
 */
const VERCEL_CNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+vercel-dns(?:-\d{1,4})?\.com$/;

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

/** Whether a CNAME answer points into Vercel's DNS — never a substring match. */
export function isAcceptedCnameTarget(record: string): boolean {
    return VERCEL_CNAME.test(record.trim().toLowerCase().replace(/\.$/, ""));
}

/** Whether an apex A record points at Vercel. */
export function isAcceptedApexIp(ip: string): boolean {
    return VERCEL_APEX_IPS.has(ip.trim());
}

/**
 * Whether a (normalized) domain is an apex: the name a merchant bought, which
 * DNS lets hold an A record but not a CNAME. `example.com`, `shop.com.iq`.
 */
export function isApexDomain(domain: string): boolean {
    const labels = domain.split(".");
    if (labels.length === 2) return true;
    return labels.length === 3 && TWO_LABEL_SUFFIXES.has(labels.slice(1).join("."));
}

/**
 * The host field a DNS panel asks for: "@" for the apex itself, else the part
 * before the apex (`shop` for shop.example.com). Most Iraqi registrars and
 * Cloudflare add the domain themselves, so pasting the full name there would
 * create `shop.example.com.example.com`.
 */
export function dnsHostLabel(domain: string): string {
    if (isApexDomain(domain)) return "@";
    const labels = domain.split(".");
    const apexLabels = TWO_LABEL_SUFFIXES.has(labels.slice(-2).join(".")) ? 3 : 2;
    return labels.slice(0, -apexLabels).join(".");
}

/** The TXT host field, relative to the apex like `dnsHostLabel`. */
export function txtHostLabel(domain: string): string {
    const host = dnsHostLabel(domain);
    return host === "@" ? DOMAIN_TXT_PREFIX : `${DOMAIN_TXT_PREFIX}.${host}`;
}
