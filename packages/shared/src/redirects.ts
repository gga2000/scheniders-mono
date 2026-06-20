// =====================================================================
// URL redirects (N3)
// =====================================================================
// Pure matching for tenant-scoped redirect rules. The storefront calls
// `matchRedirect` with the tenant-relative path of a would-be-404 page;
// if a rule matches, it issues a 308/307 to the destination. Keeping the
// logic pure makes it fully unit-testable and shared between the editor
// (validation) and the storefront (enforcement).
// =====================================================================

import type { RedirectRule } from "./types/store-config-v2";

export type { RedirectRule };

/**
 * Normalize a path for case-insensitive, trailing-slash-insensitive,
 * query/hash-insensitive comparison. Always returns a leading-slash path.
 */
export function normalizeRedirectPath(path: string): string {
    if (!path) return "/";
    let s = path.trim();
    // Drop query string / hash — redirects match on path only.
    s = s.split(/[?#]/)[0];
    if (!s.startsWith("/")) s = "/" + s;
    // Drop a trailing slash (except for the root).
    if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
    return s.toLowerCase();
}

/** True when `to` is an absolute URL (http(s):// or protocol-relative). */
function isAbsoluteUrl(to: string): boolean {
    return /^https?:\/\//i.test(to) || to.startsWith("//");
}

export interface RedirectMatch {
    to: string;
    /** true → 308 permanent, false → 307 temporary. */
    permanent: boolean;
}

/**
 * Find the first rule whose `from` matches `pathname`. Returns the resolved
 * destination + permanence, or null when nothing matches. Self-redirects
 * (a rule pointing at its own source) are skipped to avoid loops.
 */
export function matchRedirect(
    pathname: string,
    rules: RedirectRule[] | undefined | null,
): RedirectMatch | null {
    if (!rules || rules.length === 0) return null;
    const from = normalizeRedirectPath(pathname);
    for (const rule of rules) {
        if (!rule || typeof rule.from !== "string" || typeof rule.to !== "string") {
            continue;
        }
        if (!rule.from.trim() || !rule.to.trim()) continue;
        if (normalizeRedirectPath(rule.from) !== from) continue;
        // Skip a relative self-redirect (would loop forever).
        if (!isAbsoluteUrl(rule.to) && normalizeRedirectPath(rule.to) === from) {
            continue;
        }
        return { to: rule.to.trim(), permanent: rule.permanent !== false };
    }
    return null;
}

/**
 * Validate a rule list for the editor: flags empty fields, self-redirects,
 * duplicate sources, and direct A→B→A / A→B chains. Returns a per-index map
 * of human-readable issues (empty when all valid).
 */
export function validateRedirects(
    rules: RedirectRule[],
): Record<number, string> {
    const issues: Record<number, string> = {};
    const seenFrom = new Map<string, number>();
    const fromSet = new Set(
        rules
            .filter((r) => r?.from?.trim())
            .map((r) => normalizeRedirectPath(r.from)),
    );
    rules.forEach((rule, i) => {
        const from = rule?.from?.trim();
        const to = rule?.to?.trim();
        if (!from || !to) {
            issues[i] = "Both source and destination are required.";
            return;
        }
        const nFrom = normalizeRedirectPath(from);
        if (!isAbsoluteUrl(to) && normalizeRedirectPath(to) === nFrom) {
            issues[i] = "Source and destination are the same.";
            return;
        }
        const dup = seenFrom.get(nFrom);
        if (dup !== undefined) {
            issues[i] = `Duplicate source — also rule #${dup + 1}.`;
            return;
        }
        seenFrom.set(nFrom, i);
        // Chain: destination is itself a source of another rule → would
        // require a second hop. Warn (not fatal).
        if (!isAbsoluteUrl(to) && fromSet.has(normalizeRedirectPath(to))) {
            issues[i] = "Destination is itself redirected — visitors take two hops.";
        }
    });
    return issues;
}
