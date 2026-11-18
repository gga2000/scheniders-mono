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
    "partners", "fermi", "usefermi",
]);

export type SlugRejection = "format" | "reserved";

/** Trim + lowercase: people paste handles with capitals and spaces. */
export function normalizeSlug(raw: string): string {
    return raw.trim().toLowerCase();
}

/** Reserved platform subdomains, and anything posing as the platform's name. */
export function looksLikePlatformHost(slug: string): boolean {
    return RESERVED_SLUGS.has(slug) || slug.startsWith("schenider") || slug.startsWith("usefermi");
}

/** Why a (normalized) slug cannot be claimed, or null when it can. */
export function slugRejection(slug: string): SlugRejection | null {
    if (!SLUG_PATTERN.test(slug) || slug.includes("--")) return "format";
    if (looksLikePlatformHost(slug)) return "reserved";
    return null;
}

export function isValidSlug(slug: string): boolean {
    return slugRejection(slug) === null;
}

/**
 * Arabic → Latin transliteration for slugs (UX2-13).
 *
 * Without this every Arabic-named store slugged to `tenant-<timestamp>`,
 * because the `[^a-z0-9-]` strip below deleted the whole name — so the
 * merchant's public, WhatsApp-shared URL was a machine id. Iraqi
 * merchants name their store in Arabic, so this is the common path, not
 * the edge case. Mapping is intentionally simple (no diacritics, no
 * hamza forms) because the output only needs to be readable and stable.
 */
const AR_TO_LATIN: Record<string, string> = {
    "ا": "a", "أ": "a", "إ": "a", "آ": "a", "ب": "b", "ت": "t", "ث": "th",
    "ج": "j", "ح": "h", "خ": "kh", "د": "d", "ذ": "dh", "ر": "r", "ز": "z",
    "س": "s", "ش": "sh", "ص": "s", "ض": "d", "ط": "t", "ظ": "z", "ع": "a",
    "غ": "gh", "ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n",
    "ه": "h", "و": "w", "ي": "y", "ى": "a", "ة": "a", "ء": "", "ؤ": "w",
    "ئ": "y", "پ": "p", "چ": "ch", "ژ": "zh", "گ": "g", "ڵ": "l", "ڕ": "r",
    "ۆ": "o", "ێ": "e",
};

function transliterateArabic(input: string): string {
    let out = "";
    for (const ch of input) {
        if (ch in AR_TO_LATIN) out += AR_TO_LATIN[ch];
        // Drop Arabic diacritics/tatweel entirely rather than turning them
        // into separators.
        else if (/[ً-ْـ]/.test(ch)) continue;
        else out += ch;
    }
    return out;
}

/**
 * Generate a URL-safe slug from a business name.
 * "Acme Perfumes" → "acme-perfumes"
 * "متجر زهراء"    → "mtjr-zhraa"
 */
export function generateSlug(name: string): string {
    return transliterateArabic(name)
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        || `tenant-${Date.now()}`;
}

/** The longest address SLUG_PATTERN takes. */
const SLUG_MAX = 30;

/**
 * The address offered for a store name at signup (Fermi B11): the name in
 * Latin letters, cut to fit, and padded when too short. Empty when the name
 * has nothing to spell it with, so the merchant types their own. The
 * merchant can change it; the server checks it is free.
 */
export function suggestSlug(name: string): string {
    const base = transliterateArabic(name)
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
    if (base === "") return "";
    const cut = base.slice(0, SLUG_MAX).replace(/-+$/, "");
    const long = cut.length < 3 ? `${cut}-shop` : cut;
    return looksLikePlatformHost(long) ? `store-${long}`.slice(0, SLUG_MAX).replace(/-+$/, "") : long;
}
