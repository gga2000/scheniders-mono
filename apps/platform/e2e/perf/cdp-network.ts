// Chrome DevTools Protocol network + throttling for the perf harness.
//
// CDP sees what the page cannot: bytes on the wire for cross-origin requests
// (Supabase sends no Timing-Allow-Origin, so Resource Timing reports 0), the
// exact time headers arrived, and requests the app never wrapped (document,
// JS chunks, RSC payloads). Every timestamp is converted to epoch ms so it
// lines up with the page's `performance.timeOrigin + performance.now()`.

import type { CDPSession, Page } from "@playwright/test";
import { classifySupabaseRequest } from "../../lib/perf-critical-path";

export interface NetRecord {
    id: string;
    url: string;
    method: string;
    type: string;
    label: string;
    /** Epoch ms. */
    start: number;
    headersAt: number | null;
    end: number | null;
    /** Bytes on the wire (compressed), from loadingFinished. */
    bytes: number;
    status: number | null;
    failed: string | null;
    fromCache: boolean;
    /** h2, h3, http/1.1 … */
    protocol: string | null;
    /** Sent → browser actually started it (queueing, stalls, DNS, connect, TLS). */
    blockedMs: number | null;
    /** New connection setup inside `blockedMs` (0 when an existing one was reused). */
    connectMs: number | null;
    /** Request fully sent → response headers: server time plus one round trip. */
    waitMs: number | null;
    /** Headers → last byte. */
    downloadMs: number | null;
}

export const NETWORK_PRESETS = {
    none: null,
    // A typical Baghdad 4G link: what merchants actually have.
    "iraq-4g": { latency: 120, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (2 * 1024 * 1024) / 8 },
    // Lighthouse's mobile preset.
    "slow-4g": { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
} as const;
export type NetworkPreset = keyof typeof NETWORK_PRESETS;

export function labelRequest(url: string, method: string, type: string, prefer: string | null): string {
    if (url.includes(".supabase.co")) return classifySupabaseRequest(method, url, prefer);
    if (type === "Document") return "document";
    if (url.includes("_rsc=")) return "next:rsc";
    if (url.includes("/_next/static/") && url.endsWith(".css")) return "next:css";
    if (url.includes("/_next/static/") || url.includes("/_next/src/") || type === "Script") return "next:js";
    if (url.includes("/__nextjs") || url.includes("/_next/webpack-hmr") || url.includes("turbopack")) return "next:dev";
    if (url.includes("/api/")) return `api:${new URL(url).pathname.replace(/^\/api\//, "")}`;
    return `other:${type.toLowerCase()}`;
}

export class CdpNetwork {
    private readonly records = new Map<string, NetRecord & { ts0: number; wall0: number }>();

    private constructor(private readonly cdp: CDPSession) {}

    static async attach(page: Page, opts: { network: NetworkPreset; cpuSlowdown: number }): Promise<CdpNetwork> {
        const cdp = await page.context().newCDPSession(page);
        const net = new CdpNetwork(cdp);
        await cdp.send("Network.enable");
        await cdp.send("Performance.enable");
        const preset = NETWORK_PRESETS[opts.network];
        if (preset) await cdp.send("Network.emulateNetworkConditions", { offline: false, ...preset });
        if (opts.cpuSlowdown > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: opts.cpuSlowdown });

        // CDP `timestamp` is a monotonic clock in seconds; `wallTime` (on
        // requestWillBeSent only) is epoch seconds for the same instant.
        const toEpoch = (r: { ts0: number; wall0: number }, ts: number) => r.wall0 + (ts - r.ts0) * 1000;

        cdp.on("Network.requestWillBeSent", (e) => {
            const headers = e.request.headers as Record<string, string>;
            const prefer = headers.Prefer ?? headers.prefer ?? null;
            const prev = net.records.get(e.requestId);
            if (prev) return; // a redirect hop: keep the first start
            net.records.set(e.requestId, {
                id: e.requestId,
                url: e.request.url,
                method: e.request.method,
                type: e.type ?? "Other",
                label: labelRequest(e.request.url, e.request.method, e.type ?? "Other", prefer),
                start: e.wallTime * 1000,
                headersAt: null,
                end: null,
                bytes: 0,
                status: null,
                failed: null,
                fromCache: false,
                protocol: null,
                blockedMs: null,
                connectMs: null,
                waitMs: null,
                downloadMs: null,
                ts0: e.timestamp,
                wall0: e.wallTime * 1000,
            });
        });
        cdp.on("Network.responseReceived", (e) => {
            const r = net.records.get(e.requestId);
            if (!r) return;
            r.status = e.response.status;
            r.fromCache = !!(e.response.fromDiskCache || e.response.fromServiceWorker || e.response.fromPrefetchCache);
            r.protocol = e.response.protocol ?? null;
            const t = e.response.timing;
            r.headersAt = t ? toEpoch(r, t.requestTime) + t.receiveHeadersEnd : toEpoch(r, e.timestamp);
            if (t) {
                // Offsets are ms from requestTime; -1 means "did not happen".
                r.blockedMs = Math.max(0, toEpoch(r, t.requestTime) - r.start) + Math.max(0, t.sendStart);
                r.connectMs = t.connectStart >= 0 ? t.connectEnd - t.connectStart : 0;
                r.waitMs = t.receiveHeadersEnd - t.sendEnd;
            }
        });
        cdp.on("Network.loadingFinished", (e) => {
            const r = net.records.get(e.requestId);
            if (!r) return;
            r.end = toEpoch(r, e.timestamp);
            r.bytes = e.encodedDataLength;
            if (r.headersAt !== null) r.downloadMs = r.end - r.headersAt;
        });
        cdp.on("Network.loadingFailed", (e) => {
            const r = net.records.get(e.requestId);
            if (!r) return;
            r.end = toEpoch(r, e.timestamp);
            r.failed = e.canceled ? "canceled" : e.errorText;
        });
        return net;
    }

    /** Requests that started in [from, to] (epoch ms), oldest first. */
    between(from: number, to: number): NetRecord[] {
        return [...this.records.values()]
            .filter((r) => r.start >= from - 1 && r.start <= to)
            .sort((a, b) => a.start - b.start)
            .map((r): NetRecord => ({
                id: r.id, url: r.url, method: r.method, type: r.type, label: r.label, start: r.start,
                headersAt: r.headersAt, end: r.end, bytes: r.bytes, status: r.status, failed: r.failed, fromCache: r.fromCache,
                protocol: r.protocol, blockedMs: r.blockedMs, connectMs: r.connectMs, waitMs: r.waitMs, downloadMs: r.downloadMs,
            }));
    }

    /** Chrome's own counters (ScriptDuration, TaskDuration, JSHeapUsedSize, …). */
    async metrics(): Promise<Record<string, number>> {
        const { metrics } = await this.cdp.send("Performance.getMetrics");
        return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
    }

    async detach(): Promise<void> {
        await this.cdp.detach();
    }
}
