// apps/platform/app/api/chat/unfurl/route.ts
//
// SSRF-guarded link-unfurl endpoint. GET ?url=<encoded http(s) URL>.
//
// Security model (layered — every layer is mandatory, none is bypassable):
//   1. Auth      — requires a valid Supabase bearer token (same pattern as the
//                  other /api/* settings routes). Unauthenticated → 401.
//   2. Scheme    — only http: / https: accepted (rejects file:, data:,
//                  javascript:, ftp:, gopher:, …) via `new URL` parsing.
//   3. Host/DNS  — literal-IP hosts are checked directly; named hosts are
//                  resolved with dns.lookup({ all: true }) and rejected if ANY
//                  resolved address is private / loopback / link-local /
//                  unique-local (v4, v6, IPv4-mapped, 6to4, NAT64).
//                  `localhost` is rejected outright. This pre-check is
//                  defence-in-depth; the AUTHORITATIVE guard is the connect-time
//                  re-validation below (closes the DNS-rebind TOCTOU): the fetch
//                  uses an undici Agent whose `connect.lookup` resolves the host
//                  AND rejects any private address at the moment the socket is
//                  opened, so the address validated is the exact address dialled.
//   4. Redirects — fetch(..., { redirect: "manual" }); 3xx responses are NOT
//                  auto-followed. Each redirect target is re-validated through
//                  the SAME scheme + host + DNS checks before following, capped
//                  at MAX_REDIRECTS hops.
//   5. Limits    — AbortController timeout; body read capped (streamed, stop at
//                  MAX_BYTES); only text/html content-type is parsed.
//
// On any failure / blocked host the route returns a graceful empty payload
// ({ url, title:null, description:null, image:null }) and never leaks the
// internal error or whether a host was blocked vs. unreachable.
//
// Requires the Node.js runtime (uses node:dns / node:net).

import { NextRequest, NextResponse } from "next/server";
import dns from "node:dns";
import net from "node:net";
import { Agent } from "undici";
import { verifyAccessToken } from "@/lib/supabase-server";
import { isPrivateAddress } from "@/lib/chat/ssrf";
import type { UnfurlResult } from "@/types/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// SSRF-pinned dispatcher. undici calls this `lookup` at the moment it opens the
// socket; resolving + rejecting private addresses HERE (not only in the earlier
// validateUrl pre-check) closes the DNS-rebinding TOCTOU — a low-TTL resolver
// can't flip public→private between validation and connection, because the
// address validated is the address actually dialled. SNI/cert validation are
// preserved (undici still connects under the original hostname).
// ─────────────────────────────────────────────────────────────────────────────
function guardedLookup(
    hostname: string,
    options: dns.LookupOptions,
    callback: (
        err: NodeJS.ErrnoException | null,
        address: string | dns.LookupAddress[],
        family?: number,
    ) => void,
): void {
    dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) {
            callback(err, "", undefined);
            return;
        }
        for (const a of addresses) {
            if (isPrivateAddress(a.address)) {
                const blocked: NodeJS.ErrnoException = new Error("blocked private address");
                blocked.code = "ESSRFBLOCKED";
                callback(blocked, "", undefined);
                return;
            }
        }
        if (options.all) {
            callback(null, addresses);
        } else {
            const first = addresses[0];
            callback(null, first.address, first.family);
        }
    });
}

const ssrfAgent = new Agent({ connect: { lookup: guardedLookup } });

const FETCH_TIMEOUT_MS = 4_000;
const MAX_BYTES = 512 * 1024; // 512 KB
const MAX_REDIRECTS = 3;
const CACHE_TTL_MS = 10 * 60_000; // 10 min
const CACHE_MAX = 256;

// ─────────────────────────────────────────────────────────────────────────────
// URL validation (scheme + host + DNS). `isPrivateAddress` lives in the pure
// `@/lib/chat/ssrf` module so it can be unit-tested in isolation.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a URL string against scheme + host + DNS rules. Resolves named hosts
 * and rejects if ANY resolved address is private. Returns the parsed URL when
 * safe, or null when blocked/invalid. Never throws.
 */
async function validateUrl(raw: string): Promise<URL | null> {
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        return null;
    }

    // Scheme: http/https only.
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!hostname) return null;

    // Reject obvious local names outright.
    if (hostname === "localhost" || hostname.endsWith(".localhost")) return null;

    // Literal IP host → check directly, do not DNS-resolve.
    const literalFamily = net.isIP(hostname);
    if (literalFamily !== 0) {
        return isPrivateAddress(hostname) ? null : parsed;
    }

    // Named host → resolve all addresses and reject if any is private.
    let addresses: dns.LookupAddress[];
    try {
        addresses = await dns.promises.lookup(hostname, { all: true });
    } catch {
        return null;
    }
    if (addresses.length === 0) return null;
    for (const { address } of addresses) {
        if (isPrivateAddress(address)) return null;
    }
    return parsed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch with manual redirect re-validation + size/timeout caps.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch the validated URL, manually following (and re-validating) up to
 * MAX_REDIRECTS redirects, never into a private host. Returns the HTML body
 * and the final URL, or null if blocked / non-HTML / too large / timed out.
 */
async function safeFetchHtml(
    start: URL,
): Promise<{ html: string; finalUrl: URL } | null> {
    let current: URL | null = start;
    for (let hop = 0; hop <= MAX_REDIRECTS && current; hop++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        let res: Response;
        try {
            // `dispatcher` is an undici-only RequestInit extension Node's global
            // fetch honours at runtime; the DOM RequestInit type omits it, so widen.
            const init: RequestInit & { dispatcher?: Agent } = {
                redirect: "manual",
                signal: controller.signal,
                dispatcher: ssrfAgent,
                headers: {
                    // A neutral UA + accept; some sites 403 an empty UA.
                    "user-agent": "Mozilla/5.0 (compatible; SchenidersChatUnfurl/1.0)",
                    accept: "text/html,application/xhtml+xml",
                },
            };
            res = await fetch(current, init);
        } catch {
            clearTimeout(timer);
            return null;
        }
        clearTimeout(timer);

        // Redirect: re-validate the Location through the full guard before following.
        if (res.status >= 300 && res.status < 400) {
            const location = res.headers.get("location");
            if (!location) return null;
            let nextRaw: string;
            try {
                nextRaw = new URL(location, current).toString();
            } catch {
                return null;
            }
            current = await validateUrl(nextRaw);
            // Drain the redirect body so the socket can be reused/closed.
            await res.body?.cancel().catch(() => {});
            continue;
        }

        if (res.status !== 200) {
            await res.body?.cancel().catch(() => {});
            return null;
        }

        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.toLowerCase().includes("text/html")) {
            await res.body?.cancel().catch(() => {});
            return null;
        }

        const html = await readCapped(res);
        return html === null ? null : { html, finalUrl: current };
    }
    return null;
}

/** Read a response body as text, stopping once MAX_BYTES is exceeded. */
async function readCapped(res: Response): Promise<string | null> {
    if (!res.body) {
        const text = await res.text().catch(() => null);
        if (text === null) return null;
        return text.slice(0, MAX_BYTES);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: false });
    let total = 0;
    let out = "";
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
                total += value.byteLength;
                out += decoder.decode(value, { stream: true });
                if (total >= MAX_BYTES) {
                    await reader.cancel().catch(() => {});
                    break;
                }
            }
        }
    } catch {
        return null;
    }
    out += decoder.decode();
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimal meta extraction (no DOM, regex over the <head>).
// ─────────────────────────────────────────────────────────────────────────────

function decodeEntities(s: string): string {
    return s
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;|&apos;/g, "'")
        .replace(/&#x2F;/gi, "/")
        .replace(/&nbsp;/g, " ")
        .trim();
}

/** Pull the `content` of the first <meta> matching `property|name === key`. */
function metaContent(html: string, key: string): string | null {
    // Match either attribute order: property/name before or after content.
    const re = new RegExp(
        `<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`,
        "i",
    );
    const tag = html.match(re)?.[0];
    if (!tag) return null;
    const content = tag.match(/content=["']([^"']*)["']/i)?.[1];
    return content ? decodeEntities(content) : null;
}

function extractMeta(html: string, pageUrl: URL): Omit<UnfurlResult, "url"> {
    const head = html.slice(0, 200_000); // meta lives in <head>; bound the regex work.

    const titleTag = decodeEntities(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    const title =
        metaContent(head, "og:title") ??
        metaContent(head, "twitter:title") ??
        (titleTag.length ? titleTag : null);

    const description =
        metaContent(head, "og:description") ??
        metaContent(head, "twitter:description") ??
        metaContent(head, "description") ??
        null;

    const rawImage =
        metaContent(head, "og:image") ??
        metaContent(head, "og:image:url") ??
        metaContent(head, "twitter:image") ??
        null;

    let image: string | null = null;
    if (rawImage) {
        try {
            const abs = new URL(rawImage, pageUrl);
            if (abs.protocol === "http:" || abs.protocol === "https:") {
                image = abs.toString();
            }
        } catch {
            image = null;
        }
    }

    return {
        title: title && title.length ? title.slice(0, 300) : null,
        description: description && description.length ? description.slice(0, 500) : null,
        image,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tiny in-memory LRU cache (best-effort; survives within a warm lambda only).
// ─────────────────────────────────────────────────────────────────────────────

const cache = new Map<string, { at: number; value: UnfurlResult }>();

function cacheGet(url: string): UnfurlResult | null {
    const hit = cache.get(url);
    if (!hit) return null;
    if (Date.now() - hit.at > CACHE_TTL_MS) {
        cache.delete(url);
        return null;
    }
    // LRU touch.
    cache.delete(url);
    cache.set(url, hit);
    return hit.value;
}

function cacheSet(url: string, value: UnfurlResult): void {
    cache.set(url, { at: Date.now(), value });
    while (cache.size > CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
    // Layer 1: auth.
    const token = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { user, error } = await verifyAccessToken(token);
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rawUrl = request.nextUrl.searchParams.get("url");
    if (!rawUrl) {
        return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    const empty = (url: string): UnfurlResult => ({
        url,
        title: null,
        description: null,
        image: null,
    });

    const cached = cacheGet(rawUrl);
    if (cached) return NextResponse.json(cached);

    // Layers 2 + 3: scheme + host/DNS.
    const validated = await validateUrl(rawUrl);
    if (!validated) {
        // Blocked or invalid — graceful empty payload, no leak of which.
        return NextResponse.json(empty(rawUrl));
    }

    // Layers 4 + 5: manual redirects + timeout + size cap + content-type.
    const fetched = await safeFetchHtml(validated);
    if (!fetched) {
        return NextResponse.json(empty(rawUrl));
    }

    const meta = extractMeta(fetched.html, fetched.finalUrl);
    const result: UnfurlResult = { url: rawUrl, ...meta };
    cacheSet(rawUrl, result);
    return NextResponse.json(result);
}
