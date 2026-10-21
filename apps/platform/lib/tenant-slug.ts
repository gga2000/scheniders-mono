// =====================================================================
// Store handle (tenant slug) rules — UX2-13 handle claim
// =====================================================================
// Pure, so the claim dialog (client) and /api/tenant/slug (server) apply
// exactly the same rule. lib/tenant.ts cannot host it: it imports the
// service-role client.
// =====================================================================

/** 3–30 chars, lowercase latin + digits, hyphens only on the inside. */
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

/**
 * Subdomains the platform does (or plausibly will) own. A claimed handle
 * becomes `<slug>.<root-domain>` in production, so these can never be one.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
    "www", "api", "app", "admin", "mail", "smtp", "shop", "store", "stores",
    "dev", "staging", "test", "cdn", "assets", "static", "img", "images",
    "help", "support", "blog", "docs", "status", "dashboard", "login",
    "signup", "auth", "billing", "pay", "checkout", "schenider", "scheniders",
]);

export type SlugRejection = "format" | "reserved";

/** Trim + lowercase: people paste handles with capitals and spaces. */
export function normalizeSlug(raw: string): string {
    return raw.trim().toLowerCase();
}

/** Why a (normalized) slug cannot be claimed, or null when it can. */
export function slugRejection(slug: string): SlugRejection | null {
    if (!SLUG_PATTERN.test(slug) || slug.includes("--")) return "format";
    if (RESERVED_SLUGS.has(slug)) return "reserved";
    return null;
}

export function isValidSlug(slug: string): boolean {
    return slugRejection(slug) === null;
}
