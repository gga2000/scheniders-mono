// ---------------------------------------------------------------------------
// Critical-path attribution for a traced page load.
//
// Pure functions over what lib/perf-trace.ts records (milestones, network
// requests, long animation frames), so the attribution logic is unit-tested
// and the browser side only collects.
//
// The model: a load is a chain of checkpoints the page must pass in order
// (document → hydrate → session → tenant → fetch stages → render → rows
// painted). Each checkpoint's segment is the time the chain advanced while
// waiting on it: `max(0, t - cursor)`, where the cursor is the latest
// checkpoint already passed. A checkpoint reached before the cursor (auth
// already resolved on a soft navigation) costs 0 — it was not on the critical
// path. Checkpoints after the terminal one ran in the background.
//
// Each segment is then classified by what the main thread and the network
// were doing during it: a gap with a long frame in it is CPU-bound, a gap with
// requests in flight and an idle thread is network-bound, a gap with neither
// is the app waiting on itself (a timer, an animation, a gated effect).
// ---------------------------------------------------------------------------

export type PerfMeta = Record<string, number | string | boolean>;

export interface PerfMilestone {
    name: string;
    /** ms since navigation start (performance.now()). */
    t: number;
    meta?: PerfMeta;
}

export interface PerfRequest {
    label: string;
    method: string;
    /** Path + query, origin stripped, truncated. */
    url: string;
    start: number;
    /** When response headers arrived (fetch resolved). */
    headersAt: number | null;
    /** When the body finished (Resource Timing responseEnd), when known. */
    end: number | null;
    status: number | null;
    /** Row count from Content-Range, when the response carried one. */
    rows: number | null;
}

export interface PerfLongFrame {
    start: number;
    duration: number;
    /** Time the frame blocked input beyond 50 ms (LoAF blockingDuration). */
    blocking: number;
    /** Heaviest scripts in the frame, "function @ file" — empty for a plain long task. */
    scripts: string[];
}

export type SegmentKind = "cpu" | "network" | "mixed" | "idle" | "skipped";

export interface CriticalSegment {
    checkpoint: string;
    label: string;
    /** Time the chain spent waiting on this checkpoint. */
    ms: number;
    /** Checkpoint time, relative to the anchor. */
    at: number | null;
    /** Main-thread time inside the segment taken by long frames. */
    cpuMs: number;
    /** Wall time inside the segment with at least one request in flight. */
    netMs: number;
    /** Requests that were in flight during the segment, by label. */
    requests: string[];
    kind: SegmentKind;
}

export interface CheckpointDef {
    name: string;
    label: string;
}

export interface CriticalPathReport {
    anchor: number;
    anchorLabel: string;
    terminal: string;
    /** Anchor → terminal, or null when the terminal checkpoint was never reached. */
    totalMs: number | null;
    segments: CriticalSegment[];
    /** Checkpoints reached after the terminal one (off the critical path). */
    background: string[];
    /** The heaviest segments, most expensive first. */
    top: CriticalSegment[];
}

/** Total length of the union of [start, end) intervals, clipped to [from, to). */
export function coveredMs(intervals: ReadonlyArray<readonly [number, number]>, from: number, to: number): number {
    if (to <= from) return 0;
    const clipped = intervals
        .map(([s, e]) => [Math.max(s, from), Math.min(e, to)] as const)
        .filter(([s, e]) => e > s)
        .sort((a, b) => a[0] - b[0]);
    let total = 0;
    let curStart = -Infinity;
    let curEnd = -Infinity;
    for (const [s, e] of clipped) {
        if (s > curEnd) {
            if (curEnd > curStart) total += curEnd - curStart;
            curStart = s;
            curEnd = e;
        } else if (e > curEnd) {
            curEnd = e;
        }
    }
    if (curEnd > curStart) total += curEnd - curStart;
    return total;
}

/** A request's effective end: body end, else headers, else still open at `fallback`. */
export function requestEnd(r: PerfRequest, fallback: number): number {
    return r.end ?? r.headersAt ?? fallback;
}

export function classifySegment(ms: number, cpuMs: number, netMs: number): SegmentKind {
    if (ms <= 0) return "skipped";
    const cpu = cpuMs / ms;
    const net = netMs / ms;
    if (cpu >= 0.5 && net >= 0.5) return "mixed";
    if (cpu >= 0.5) return "cpu";
    if (net >= 0.5) return "network";
    return "idle";
}

/**
 * Walk `checkpoints` in order from `anchor` and attribute the chain's time.
 * `milestones` may hold repeats (a refetch); the first occurrence at or after
 * the anchor is the one on this load's path.
 */
export function buildCriticalPath(input: {
    anchor: number;
    anchorLabel: string;
    checkpoints: readonly CheckpointDef[];
    terminal: string;
    milestones: readonly PerfMilestone[];
    requests: readonly PerfRequest[];
    longFrames: readonly PerfLongFrame[];
    topN?: number;
}): CriticalPathReport {
    const { anchor, checkpoints, terminal, milestones, requests, longFrames } = input;

    const firstAt = (name: string): number | null => {
        let best: number | null = null;
        for (const m of milestones) {
            if (m.name !== name || m.t < anchor) continue;
            if (best === null || m.t < best) best = m.t;
        }
        return best;
    };

    const terminalAt = firstAt(terminal);
    const horizon = terminalAt ?? Math.max(anchor, ...milestones.map((m) => m.t));
    const frames = longFrames.map((f) => [f.start, f.start + f.duration] as const);

    const segments: CriticalSegment[] = [];
    const background: string[] = [];
    let cursor = anchor;
    for (const cp of checkpoints) {
        const t = firstAt(cp.name);
        if (t === null) {
            segments.push({ checkpoint: cp.name, label: cp.label, ms: 0, at: null, cpuMs: 0, netMs: 0, requests: [], kind: "skipped" });
            continue;
        }
        if (terminalAt !== null && t > terminalAt) {
            background.push(cp.name);
            continue;
        }
        const from = cursor;
        const to = Math.max(cursor, t);
        const ms = to - from;
        const inFlight = requests.filter((r) => r.start < to && requestEnd(r, horizon) > from);
        const netMs = coveredMs(inFlight.map((r) => [r.start, requestEnd(r, horizon)] as const), from, to);
        const cpuMs = coveredMs(frames, from, to);
        const labels = [...new Set(inFlight.map((r) => r.label))];
        segments.push({
            checkpoint: cp.name,
            label: cp.label,
            ms: round(ms),
            at: round(t - anchor),
            cpuMs: round(cpuMs),
            netMs: round(netMs),
            requests: labels,
            kind: classifySegment(ms, cpuMs, netMs),
        });
        cursor = to;
    }

    const top = [...segments].filter((s) => s.ms > 0).sort((a, b) => b.ms - a.ms).slice(0, input.topN ?? 3);
    return {
        anchor,
        anchorLabel: input.anchorLabel,
        terminal,
        totalMs: terminalAt === null ? null : round(terminalAt - anchor),
        segments,
        background,
        top,
    };
}

/**
 * Name a Supabase request by what it is for, so a waterfall reads as
 * "orders page ×6" rather than six identical URLs. `prefer` is the Prefer
 * header (count=exact marks a count read).
 */
export function classifySupabaseRequest(method: string, url: string, prefer: string | null): string {
    let path = url;
    let query = "";
    const q = url.indexOf("?");
    if (q >= 0) {
        path = url.slice(0, q);
        query = url.slice(q + 1);
    }
    path = path.replace(/^https?:\/\/[^/]+/, "");
    const params = new URLSearchParams(query);
    const select = params.get("select") ?? "";
    const m = method.toUpperCase();

    if (path.startsWith("/auth/v1/")) return `auth:${path.slice("/auth/v1/".length).split("/")[0]}`;
    if (path.startsWith("/realtime/")) return "realtime";
    if (path.startsWith("/storage/")) return "storage";
    if (path.startsWith("/functions/v1/")) return `fn:${path.slice("/functions/v1/".length).split("/")[0]}`;
    const rpc = path.match(/^\/rest\/v1\/rpc\/([^/?]+)/);
    if (rpc) return `rpc:${rpc[1]}`;
    const table = path.match(/^\/rest\/v1\/([^/?]+)/)?.[1];
    if (!table) return `other:${path}`;

    if (m !== "GET" && m !== "HEAD") return `${table}:${m.toLowerCase()}`;
    const isCount = m === "HEAD" || (prefer ?? "").includes("count=");
    const paged = params.has("offset") || params.has("limit");

    if (table === "orders") {
        if (select === "updated_at") return "orders:watermark";
        if (isCount && (m === "HEAD" || select === "id")) return "orders:count";
        if (params.has("updated_at")) return "orders:delta";
        if (paged) return "orders:page";
        return "orders:read";
    }
    if (table === "customer_trust") {
        if (isCount) return "trust:count";
        if (params.has("phone")) return "trust:in";
        return paged ? "trust:page" : "trust:read";
    }
    return isCount ? `${table}:count` : table;
}

/** Group requests by label: count, wall span, slowest single request. */
export function summarizeRequests(requests: readonly PerfRequest[], from: number, to: number): Array<{
    label: string;
    count: number;
    firstStart: number;
    lastEnd: number;
    wallMs: number;
    slowestMs: number;
    rows: number;
}> {
    const groups = new Map<string, PerfRequest[]>();
    for (const r of requests) {
        if (r.start > to || requestEnd(r, to) < from) continue;
        const list = groups.get(r.label) ?? [];
        list.push(r);
        groups.set(r.label, list);
    }
    return [...groups.entries()]
        .map(([label, list]) => {
            const firstStart = Math.min(...list.map((r) => r.start));
            const lastEnd = Math.max(...list.map((r) => requestEnd(r, to)));
            return {
                label,
                count: list.length,
                firstStart: round(firstStart - from),
                lastEnd: round(lastEnd - from),
                wallMs: round(lastEnd - firstStart),
                slowestMs: round(Math.max(...list.map((r) => requestEnd(r, to) - r.start))),
                rows: list.reduce((n, r) => n + (r.rows ?? 0), 0),
            };
        })
        .sort((a, b) => a.firstStart - b.firstStart);
}

/** Rows from a PostgREST Content-Range header ("0-999/5176" → 1000, "*\/0" → 0). */
export function rowsFromContentRange(header: string | null): number | null {
    if (!header) return null;
    const m = header.match(/^(\d+)-(\d+)\//);
    if (m) return Number(m[2]) - Number(m[1]) + 1;
    return header.startsWith("*/") ? 0 : null;
}

function round(n: number): number {
    return Math.round(n * 10) / 10;
}
