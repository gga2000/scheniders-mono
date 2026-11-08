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
//                  `localhost` is rejected outright.
//                  The request itself goes through node:http(s) with a
//                  `lookup` that re-checks every resolved address at connect
//                  time, so a low-TTL resolver cannot rebind public→private
//                  between the check and the fetch (DNS rebinding).
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
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { Readable } from "node:stream";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { isPrivateAddress } from "@/lib/chat/ssrf";
import type { UnfurlResult } from "@/types/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FETCH_TIMEOUT_MS = 4_000;
const MAX_BYTES = 512 * 1024; // 512 KB
const MAX_REDIRECTS = 3;
const CACHE_TTL_MS = 10 * 60_000; // 10 min
const CACHE_MAX = 256;
// Previews per store per minute. A chat shows a few links at a time; this
// bounds how hard one login can drive the server to fetch arbitrary URLs.
const UNFURLS_PER_STORE_PER_MINUTE = 60;

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

/**
 * DNS lookup for the actual connection: resolves like the OS would, then
 * refuses the connection if any address is private. This is what closes DNS
 * rebinding: the address checked is the address connected to.
 */
const pinnedLookup: net.LookupFunction = (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) return callback(err, "", 0);
        const list = Array.isArray(addresses) ? addresses : [];
        if (list.length === 0 || list.some(a => isPrivateAddress(a.address))) {
            return callback(Object.assign(new Error("blocked address"), { code: "EBLOCKED" }), "", 0);
        }
        if (options.all) {
            (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
            return;
        }
        callback(null, list[0].address, list[0].family);
    });
};

/** One GET with no redirect following, connecting only to public addresses. */
function pinnedGet(url: URL, signal: AbortSignal): Promise<Response> {
    const client = url.protocol === "https:" ? https : http;
    return new Promise((resolve, reject) => {
        const req = client.get(
            url,
            {
                lookup: pinnedLookup,
                // A fresh connection per request: every connect goes through
                // pinnedLookup, never a pooled socket from an earlier hop.
                agent: false,
                signal,
                headers: {
                    // A neutral UA + accept; some sites 403 an empty UA.
                    "user-agent": "Mozilla/5.0 (compatible; SchenidersChatUnfurl/1.0)",
                    accept: "text/html,application/xhtml+xml",
                },
            },
            res => {
                const headers = new Headers();
                for (const [key, value] of Object.entries(res.headers)) {
                    if (typeof value === "string") headers.set(key, value);
                    else if (Array.isArray(value)) headers.set(key, value.join(", "));
                }
                const status = res.statusCode ?? 502;
                // Response() forbids a body on these statuses.
                const bodyless = status === 204 || status === 304 || (status >= 100 && status < 200);
                if (bodyless) res.resume();
                resolve(
                    new Response(
                        bodyless ? null : (Readable.toWeb(res) as ReadableStream<Uint8Array>),
                        { status: status < 200 || status > 599 ? 502 : status, headers },
                    ),
                );
            },
        );
        req.on("error", reject);
    });
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
            res = await pinnedGet(current, controller.signal);
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
    // Layer 1: auth — an active store member, not just any account.
    const caller = await requireRequestCaller(request, "member");
    if (!caller.ok) return caller.response;

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

    // Each miss makes the server fetch an outside URL: cap it per store.
    const limit = await consumeRateLimit(`chat-unfurl:${caller.tenantId}`, UNFURLS_PER_STORE_PER_MINUTE, 60);
    if (limit.error) console.error(`[chat/unfurl] rate limiter unavailable: ${limit.error}`);
    if (!limit.allowed) {
        return NextResponse.json(empty(rawUrl), { headers: rateLimitHeaders(limit, UNFURLS_PER_STORE_PER_MINUTE) });
    }

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
