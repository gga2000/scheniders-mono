// =====================================================================
// Editor-shell pure helpers (extracted from editor-shell, 4.1)
// =====================================================================
// No React here — these are plain functions the shell (and tests) use:
// preview-URL building, section-id generation, JSON cloning, and the
// inline-edit field-path parser.
// =====================================================================

// Local-dev fallback when no token is plumbed through (tests / harnesses).
export const DEV_PREVIEW_TOKEN = "dev-preview-token";

export function buildPreviewUrl(
    base: string,
    tenantSlug: string,
    page: string,
    breakpoint: string,
    locale: string,
    token: string,
): string {
    // Strip any tenant-suffix the storefront URL helper may have appended
    // and target the dedicated preview route under the storefront origin.
    let origin = base;
    try {
        const parsed = new URL(base);
        origin = parsed.origin;
    } catch {
        // Treat as already-an-origin.
    }
    // The page id is a PATH segment — the storefront route is
    // `/_preview/[tenant]/[page_id]`. A `?page=` query is only a
    // lower-priority alias there, so emitting the page as a query alone
    // (with no path segment) 404s the iframe. Keep token/breakpoint/locale
    // in the query.
    const params = new URLSearchParams({
        token,
        breakpoint,
        locale,
    });
    return `${origin}/_preview/${tenantSlug}/${encodeURIComponent(page)}?${params.toString()}`;
}

export function generateSectionId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function deepCloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Parse a path like `foo.bar[2].baz` into an ordered list of string keys
 * and numeric array indices. Used for inline-edit field-paths emitted by
 * section components.
 */
export function parsePathSegments(path: string): Array<string | number> {
    if (!path) return [];
    const segs: Array<string | number> = [];
    const parts = path.split(".");
    for (const part of parts) {
        // Match `name`, `name[0]`, `[0]`, possibly nested `[0][1]`.
        const bracketMatch = /^([^\[\]]*)(.*)$/.exec(part);
        if (!bracketMatch) continue;
        const head = bracketMatch[1];
        const rest = bracketMatch[2];
        if (head) segs.push(head);
        const indexRe = /\[(\d+)\]/g;
        let m: RegExpExecArray | null;
        while ((m = indexRe.exec(rest)) !== null) {
            segs.push(Number(m[1]));
        }
    }
    return segs;
}
