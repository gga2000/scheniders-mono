// packages/shared/src/public-fetch.ts
//
// A server GET of an outside link that can only reach the public internet,
// for every place the servers fetch a link someone else wrote: the chat's
// link previews (platform) and the console's product image import (admin).
// Node only (node:dns, node:http).
//
// Every layer is mandatory:
//   1. Scheme  — only http: and https:, no user:password@ in the link.
//   2. Host    — a literal IP is checked as it is; a name is resolved and
//                refused if ANY address is private, loopback, link-local or
//                unique-local (ssrf.ts: v4, v6, IPv4-mapped, 6to4, NAT64);
//                "localhost" is refused outright.
//   3. Connect — the request goes through node:http(s) with a lookup that
//                checks every address again at connect time, on a fresh
//                socket, so a low-TTL resolver cannot rebind public→private
//                between the check and the fetch (DNS rebinding).
//   4. Redirects are never followed blindly: each Location goes through the
//                same checks, at most `maxRedirects` hops.
//   5. Limits  — the caller's signal stops the whole fetch, body included;
//                readCapped stops reading at a byte cap.

import dns from "node:dns";
import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import net from "node:net";
import { pipeline, Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { isPrivateAddress } from "./ssrf";

/** The link as a URL when it may be fetched, or null. Resolves names; never throws. */
export async function validatePublicUrl(raw: string): Promise<URL | null> {
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        return null;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;

    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!hostname) return null;
    if (hostname === "localhost" || hostname.endsWith(".localhost")) return null;

    if (net.isIP(hostname) !== 0) return isPrivateAddress(hostname) ? null : parsed;

    let addresses: dns.LookupAddress[];
    try {
        addresses = await dns.promises.lookup(hostname, { all: true });
    } catch {
        return null;
    }
    if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) return null;
    return parsed;
}

/**
 * DNS lookup for the connection itself: resolves like the OS would, then
 * refuses if any address is private. The address checked is the address
 * connected to.
 */
const pinnedLookup: net.LookupFunction = (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) return callback(err, "", 0);
        const list = Array.isArray(addresses) ? addresses : [];
        if (list.length === 0 || list.some((a) => isPrivateAddress(a.address))) {
            return callback(Object.assign(new Error("blocked address"), { code: "EBLOCKED" }), "", 0);
        }
        if (options.all) {
            (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
            return;
        }
        callback(null, list[0].address, list[0].family);
    });
};

/**
 * node:http does not decompress; undo the common encodings. pipeline, not
 * pipe: when the caller's signal ends the request, the decoder is destroyed
 * with it and the body read fails at once. With pipe() a compressed answer
 * that stalled kept the read waiting long past the signal (round 18).
 */
function decoded(res: IncomingMessage, headers: Headers): Readable {
    const encoding = (headers.get("content-encoding") ?? "").trim().toLowerCase();
    const decoder =
        encoding === "gzip" || encoding === "x-gzip" ? createGunzip()
        : encoding === "deflate" ? createInflate()
        : encoding === "br" ? createBrotliDecompress()
        : null;
    if (!decoder) return res;
    headers.delete("content-encoding");
    headers.delete("content-length");
    // The error, if any, reaches the reader through the destroyed decoder.
    pipeline(res, decoder, () => {});
    return decoder;
}

/** One GET with no redirect following, connecting only to public addresses. */
function pinnedGet(url: URL, signal: AbortSignal, requestHeaders: Record<string, string>): Promise<Response> {
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
                headers: { "accept-encoding": "gzip, deflate, br", ...requestHeaders },
            },
            (res) => {
                const headers = new Headers();
                for (const [key, value] of Object.entries(res.headers)) {
                    if (typeof value === "string") headers.set(key, value);
                    else if (Array.isArray(value)) headers.set(key, value.join(", "));
                }
                const status = res.statusCode ?? 502;
                // Response() forbids a body on these statuses.
                const bodyless = status === 204 || status === 304 || (status >= 100 && status < 200);
                if (bodyless) res.resume();
                const body = bodyless ? null : decoded(res, headers);
                resolve(
                    new Response(body ? (Readable.toWeb(body) as ReadableStream<Uint8Array>) : null, {
                        status: status < 200 || status > 599 ? 502 : status,
                        headers,
                    }),
                );
            },
        );
        req.on("error", reject);
    });
}

export interface PublicFetchOptions {
    /** Stops the whole fetch, the body read included. */
    signal: AbortSignal;
    headers: Record<string, string>;
    maxRedirects: number;
}

/**
 * GET a link checked by validatePublicUrl, following and re-checking up to
 * `maxRedirects` redirects. The answer is the first response that is not a
 * redirect, whatever its status, and the URL it came from; null when the
 * link, a redirect or the connection is refused, or the fetch fails.
 */
export async function fetchPublic(start: URL, options: PublicFetchOptions): Promise<{ res: Response; url: URL } | null> {
    let current: URL | null = start;
    for (let hop = 0; hop <= options.maxRedirects && current; hop++) {
        let res: Response;
        try {
            res = await pinnedGet(current, options.signal, options.headers);
        } catch {
            return null;
        }
        if (res.status < 300 || res.status >= 400) return { res, url: current };
        const location = res.headers.get("location");
        await res.body?.cancel().catch(() => {});
        if (!location) return null;
        let next: string;
        try {
            next = new URL(location, current).toString();
        } catch {
            return null;
        }
        current = await validatePublicUrl(next);
    }
    return null;
}

/**
 * A body's bytes, read until `maxBytes`. Past it: "cut" keeps the first
 * `maxBytes`, "refuse" answers "too_big". Null when the read fails.
 */
export async function readCapped(
    res: Response,
    maxBytes: number,
    past: "cut" | "refuse",
): Promise<Uint8Array | "too_big" | null> {
    if (!res.body) return new Uint8Array(0);
    const reader = res.body.getReader();
    const parts: Uint8Array[] = [];
    let total = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;
            if (total + value.byteLength > maxBytes) {
                await reader.cancel().catch(() => {});
                if (past === "refuse") return "too_big";
                parts.push(value.subarray(0, maxBytes - total));
                total = maxBytes;
                break;
            }
            parts.push(value);
            total += value.byteLength;
        }
    } catch {
        return null;
    }
    const out = new Uint8Array(total);
    let at = 0;
    for (const part of parts) {
        out.set(part, at);
        at += part.byteLength;
    }
    return out;
}
