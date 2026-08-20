import { redirect, permanentRedirect } from "next/navigation";
import { matchRedirect } from "@scheniders/shared";
import type { StoreConfigV2 } from "@scheniders/shared";

/**
 * Enforce a tenant's configured URL redirects (N3) for a would-be-404 path.
 *
 * Call BEFORE `notFound()` on slug-driven routes (product/category): if the
 * relative path matches a published redirect rule, this issues a 308 (or 307
 * for temporary) and never returns. The target is resolved under the tenant
 * base (`/s/<tenant>`). No-op when nothing matches, so the caller falls through
 * to `notFound()`.
 *
 * SECURITY: only SAME-STORE relative redirects are honored. An absolute or
 * protocol-relative `to` (`https://evil.com`, `//evil.com`) would be an open
 * redirect — and since the publish path can't yet guarantee a rule wasn't
 * injected by a low-privilege member, we refuse off-site targets outright and
 * fall through to 404 rather than bounce the visitor off-domain (phishing/SEO
 * hijack vector — see EC5).
 */
export function enforceRedirect(
    config: StoreConfigV2 | null | undefined,
    tenantParam: string,
    relativePath: string,
): void {
    const match = matchRedirect(relativePath, config?.redirects);
    if (!match) return;

    // Reject off-site / protocol-relative / scheme-bearing targets.
    if (/^[a-z][a-z0-9+.-]*:/i.test(match.to) || match.to.startsWith("//")) {
        return;
    }

    const path = match.to.startsWith("/") ? match.to : `/${match.to}`;
    // Percent-encode non-ASCII target paths (Arabic slugs are common here) —
    // a raw multibyte Location header 500s the response.
    const encoded = encodeURI(path);
    // Custom-domain requests reach this route rewritten as
    // `/s/__domain__<host>/…`; that internal param must never leak into the
    // browser-facing Location. On a custom domain the tenant IS the host, so
    // the public target is the bare path — the proxy re-rewrites it inbound.
    const target = tenantParam.startsWith("__domain__")
        ? encoded
        : `/s/${tenantParam}${encoded}`;

    // `permanentRedirect`/`redirect` throw to interrupt rendering.
    if (match.permanent) permanentRedirect(target);
    redirect(target);
}
