// apps/platform/app/api/chat/unfurl/route.ts
//
// SSRF-guarded link-unfurl endpoint. GET ?url=<encoded http(s) URL>.
//
// Security model (layered — every layer is mandatory, none is bypassable):
//   1. Auth      — an active store member (requireRequestCaller). Else 401.
//   2-5. Scheme, host/DNS (literal IPs and every resolved address), the
//        pinned connection that closes DNS rebinding, re-checked redirects
//        (at most MAX_REDIRECTS) and the timeout: @scheniders/shared/public-fetch,
//        the one guarded fetch every server fetch of an outside link uses.
//   6. Limits    — FETCH_TIMEOUT_MS for the whole fetch, the body cut at
//                  MAX_BYTES; only a text/html answer is parsed.
//
// On any failure / blocked host the route returns a graceful empty payload
// ({ url, title:null, description:null, image:null }) and never leaks the
// internal error or whether a host was blocked vs. unreachable.
//
// Requires the Node.js runtime (public-fetch uses node:dns / node:http).

import { NextRequest, NextResponse } from "next/server";
import { fetchPublic, readCapped, validatePublicUrl } from "@scheniders/shared/public-fetch";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import type { UnfurlResult } from "@/types/chat";
import { withFailureReport } from "@/lib/job-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The whole fetch: every redirect hop and the body.
const FETCH_TIMEOUT_MS = 6_000;
const MAX_BYTES = 512 * 1024; // 512 KB
const MAX_REDIRECTS = 3;
const CACHE_TTL_MS = 10 * 60_000; // 10 min
const CACHE_MAX = 256;
// Previews per store per minute. A chat shows a few links at a time; this
// bounds how hard one login can drive the server to fetch arbitrary URLs.
const UNFURLS_PER_STORE_PER_MINUTE = 60;

// ─────────────────────────────────────────────────────────────────────────────
// The fetch: scheme, host, DNS, pinned connection and redirect checks all live
// in @scheniders/shared/public-fetch (with the address guard in its ssrf.ts),
// shared with every other server fetch of an outside link.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch the validated URL, following (and re-checking) up to MAX_REDIRECTS
 * redirects, never into a private host. Returns the HTML body (first
 * MAX_BYTES) and the final URL, or null if blocked / non-HTML / timed out.
 */
async function safeFetchHtml(start: URL): Promise<{ html: string; finalUrl: URL } | null> {
    const fetched = await fetchPublic(start, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        maxRedirects: MAX_REDIRECTS,
        headers: {
            // A neutral UA + accept; some sites 403 an empty UA.
            "user-agent": "Mozilla/5.0 (compatible; SchenidersChatUnfurl/1.0)",
            accept: "text/html,application/xhtml+xml",
        },
    });
    if (!fetched) return null;
    const { res, url } = fetched;
    const contentType = res.headers.get("content-type") ?? "";
    if (res.status !== 200 || !contentType.toLowerCase().includes("text/html")) {
        await res.body?.cancel().catch(() => {});
        return null;
    }
    const bytes = await readCapped(res, MAX_BYTES, "cut");
    if (bytes === null || bytes === "too_big") return null;
    return { html: new TextDecoder("utf-8", { fatal: false }).decode(bytes), finalUrl: url };
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

async function handleGET(request: NextRequest): Promise<NextResponse> {
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
    const validated = await validatePublicUrl(rawUrl);
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

export const GET = withFailureReport("api/chat/unfurl GET", handleGET);
