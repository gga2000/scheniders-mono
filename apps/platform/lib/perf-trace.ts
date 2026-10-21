// ---------------------------------------------------------------------------
// Performance Trace — page-load instrumentation (dashboard, /orders)
//
// Purpose: capture a hard, reproducible BEFORE/AFTER baseline of what actually
// gates a page's first useful paint, so we can prove (not assume) where the
// time goes. Records:
//
//   - milestones (ms since navigation start, first-wins unless repeated),
//   - async spans and synchronous blocks (also emitted as User Timing
//     measures, so they show up in the DevTools Performance panel's Timings
//     track next to the network and main-thread tracks),
//   - every Supabase request the app makes, labelled by purpose
//     (lib/perf-critical-path.ts classifySupabaseRequest), with headers time
//     from the fetch wrapper and body end from Resource Timing,
//   - long animation frames (LoAF, with script attribution) or, where LoAF is
//     unsupported, long tasks,
//   - React Profiler commits for subtrees wrapped in <Profiler>,
//   - the click that started a client-side navigation, so a soft navigation
//     is measured from the click, not from the document's navigation start.
//
// Active in development, or in any build when `localStorage.perfTrace === '1'`
// (so a production build can be measured on demand). Zero cost otherwise:
// every entry point no-ops when inactive.
//
// Read the result in the console (printed automatically once a traced route
// paints), or programmatically via `window.__perfTrace.report('orders')` —
// e2e/perf/orders-load.spec.ts does exactly that.
// ---------------------------------------------------------------------------

import {
    buildCriticalPath,
    classifySupabaseRequest,
    requestEnd,
    rowsFromContentRange,
    summarizeRequests,
    type CheckpointDef,
    type CriticalPathReport,
    type PerfLongFrame,
    type PerfMeta,
    type PerfMilestone,
    type PerfRequest,
} from '@/lib/perf-critical-path';

type Meta = PerfMeta;

interface ReactCommit {
    id: string;
    phase: string;
    /** Render time of the committed subtree (React Profiler actualDuration). */
    ms: number;
    commitAt: number;
}

interface RouteVisit {
    route: string;
    mountAt: number;
    anchor: number;
    anchorLabel: string;
}

const isBrowser = typeof window !== 'undefined';

function active(): boolean {
    if (!isBrowser) return false;
    if (process.env.NODE_ENV === 'development') return true;
    try {
        return localStorage.getItem('perfTrace') === '1';
    } catch {
        return false;
    }
}

const ACTIVE = active();

/** Ring-buffer bound per store: realtime deltas keep recording for the life of the tab. */
const MAX_ENTRIES = 4000;
function push<T>(list: T[], item: T): void {
    list.push(item);
    if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);
}

const milestones: PerfMilestone[] = [];
/** A request as recorded: the full URL is kept only to match its Resource Timing entry. */
type TracedRequest = PerfRequest & { id: number; fullUrl: string };
const requests: TracedRequest[] = [];
const longFrames: PerfLongFrame[] = [];
const commits: ReactCommit[] = [];
const visits: RouteVisit[] = [];
const seen = new Set<string>();
let summarized = false;
let lastClick: { t: number; href: string | null } | null = null;
let requestSeq = 0;

function record(name: string, meta?: Meta, allowDup = false, at?: number): void {
    if (!ACTIVE) return;
    if (!allowDup && seen.has(name)) return;
    seen.add(name);
    const t = at ?? performance.now();
    push(milestones, { name, t, meta });
    try {
        performance.mark(`perf:${name}`, { startTime: t, detail: meta });
    } catch {
        /* performance.mark unsupported — the milestone is still recorded */
    }
    // The dashboard's summary prints the first time it paints.
    if (name === 'dashboard:first-paint') queueMicrotask(summary);
}

/** Record a milestone (first occurrence wins). */
function mark(name: string, meta?: Meta): void {
    record(name, meta, false);
}

/** Record a milestone that may legitimately repeat (e.g. a refetch). */
function markRepeat(name: string, meta?: Meta): void {
    record(name, meta, true);
}

function measure(name: string, start: number, end: number, meta?: Meta): void {
    try {
        performance.measure(`perf:${name}`, { start, end, detail: meta });
    } catch {
        /* performance.measure unsupported — the milestone is still recorded */
    }
}

/**
 * Time a SYNCHRONOUS block (the thing that blocks the main thread) and record
 * its duration. Returns the block's value. `bytesOf` optionally records the
 * serialized size of the result so we can attribute payload weight. Recorded
 * as the repeatable milestone `sync:<name>` at the block's end.
 */
function time<T>(name: string, fn: () => T, bytesOf?: (r: T) => number): T {
    if (!ACTIVE) return fn();
    const t0 = performance.now();
    const result = fn();
    const t1 = performance.now();
    const meta: Meta = { ms: round(t1 - t0) };
    if (bytesOf) {
        try {
            meta.kb = round(bytesOf(result) / 1024);
        } catch {
            /* sizing is best-effort; the duration is still recorded */
        }
    }
    record(`sync:${name}`, meta, true, t1);
    measure(`sync:${name}`, t0, t1, meta);
    return result;
}

/**
 * Time an ASYNC step. Recorded as the repeatable milestone `<name>` at the
 * step's end (with `ms` and whatever `metaOf` derives from the result), plus
 * a User Timing measure spanning it. A rejected step is recorded with
 * `failed: true` and rethrown.
 */
async function span<T>(name: string, fn: () => Promise<T>, metaOf?: (r: T) => Meta): Promise<T> {
    if (!ACTIVE) return fn();
    const t0 = performance.now();
    try {
        const result = await fn();
        const t1 = performance.now();
        const meta: Meta = { ms: round(t1 - t0), ...(metaOf ? metaOf(result) : {}) };
        record(name, meta, true, t1);
        measure(name, t0, t1, meta);
        return result;
    } catch (err) {
        const t1 = performance.now();
        record(name, { ms: round(t1 - t0), failed: true }, true, t1);
        measure(name, t0, t1, { failed: true });
        throw err;
    }
}

// ── Network ────────────────────────────────────────────────────────────────

function headerOf(headers: HeadersInit | undefined, name: string): string | null {
    if (!headers) return null;
    if (headers instanceof Headers) return headers.get(name);
    if (Array.isArray(headers)) {
        const hit = headers.find(([k]) => k.toLowerCase() === name.toLowerCase());
        return hit ? hit[1] : null;
    }
    const rec = headers as Record<string, string>;
    const key = Object.keys(rec).find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? rec[key] : null;
}

/** Called by the Supabase fetch wrapper as a request leaves. Returns a handle for `requestDone`. */
function requestStart(url: string, init: RequestInit | undefined): number {
    if (!ACTIVE) return -1;
    const method = (init?.method ?? 'GET').toUpperCase();
    const id = requestSeq++;
    push(requests, {
        label: classifySupabaseRequest(method, url, headerOf(init?.headers, 'Prefer')),
        method,
        url: url.replace(/^https?:\/\/[^/]+/, '').slice(0, 160),
        fullUrl: url,
        start: performance.now(),
        headersAt: null,
        end: null,
        status: null,
        rows: null,
        id,
    });
    return id;
}

/** Called when the response headers arrive (or the request fails: `response` null). */
function requestDone(id: number, response: Response | null): void {
    if (!ACTIVE || id < 0) return;
    const r = requests.find((x) => x.id === id);
    if (!r) return;
    r.headersAt = performance.now();
    r.status = response ? response.status : 0;
    r.rows = response ? rowsFromContentRange(response.headers.get('content-range')) : null;
}

/**
 * Fill each request's body end from Resource Timing (responseEnd is exposed
 * cross-origin without Timing-Allow-Origin; sizes are not — Supabase sends no
 * TAO, so byte counts come from the e2e harness's CDP capture instead).
 */
function resolveRequestEnds(): void {
    if (!isBrowser) return;
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const used = new Set<PerformanceResourceTiming>();
    for (const r of requests) {
        if (r.end !== null) continue;
        let best: PerformanceResourceTiming | null = null;
        for (const e of entries) {
            if (used.has(e) || e.name !== r.fullUrl) continue;
            if (e.startTime < r.start - 5) continue;
            if (!best || e.startTime < best.startTime) best = e;
        }
        if (best) {
            used.add(best);
            r.end = best.responseEnd;
        }
    }
}

// ── Main thread ────────────────────────────────────────────────────────────

interface LoafScript {
    duration: number;
    sourceURL?: string;
    sourceFunctionName?: string;
    invoker?: string;
}
interface LoafEntry extends PerformanceEntry {
    blockingDuration?: number;
    scripts?: LoafScript[];
}

function scriptName(s: LoafScript): string {
    const file = (s.sourceURL ?? '').split('?')[0].split('/').pop() || '?';
    const fn = s.sourceFunctionName || s.invoker || 'anonymous';
    return `${fn} @ ${file} (${Math.round(s.duration)}ms)`;
}

function observeMainThread(): void {
    if (typeof PerformanceObserver === 'undefined') return;
    const supported = PerformanceObserver.supportedEntryTypes ?? [];
    const type = supported.includes('long-animation-frame') ? 'long-animation-frame' : supported.includes('longtask') ? 'longtask' : null;
    if (!type) return;
    try {
        new PerformanceObserver((list) => {
            for (const e of list.getEntries() as LoafEntry[]) {
                const scripts = (e.scripts ?? [])
                    .slice()
                    .sort((a, b) => b.duration - a.duration)
                    .slice(0, 3)
                    .map(scriptName);
                push(longFrames, {
                    start: e.startTime,
                    duration: e.duration,
                    blocking: e.blockingDuration ?? Math.max(0, e.duration - 50),
                    scripts,
                });
            }
        }).observe({ type, buffered: true });
    } catch {
        /* observer unsupported — segments then report cpuMs 0 */
    }
}

function observeClicks(): void {
    // Capture phase, so a handler that stops propagation still lets us see the
    // click that started a client-side navigation.
    window.addEventListener(
        'click',
        (e) => {
            const target = e.target instanceof Element ? e.target.closest('a[href]') : null;
            lastClick = { t: e.timeStamp || performance.now(), href: target?.getAttribute('href') ?? null };
        },
        { capture: true, passive: true },
    );
}

/** React <Profiler onRender>: records each commit's render time. */
function reactCommit(id: string, phase: string, actualDuration: number, _baseDuration: number, _startTime: number, commitTime: number): void {
    if (!ACTIVE) return;
    push(commits, { id, phase, ms: actualDuration, commitAt: commitTime });
}

// ── Route reports ──────────────────────────────────────────────────────────

/** How long before a route mounts a click still counts as the one that opened it. */
const NAV_INTENT_WINDOW_MS = 15_000;

/**
 * A traced route mounted: pick what its load is measured from. The first
 * route of a document is measured from navigation start; a later one from the
 * click that opened it (when there was one in the last 15s).
 */
function beginRoute(route: string): void {
    if (!ACTIVE) return;
    const mountAt = performance.now();
    // StrictMode mounts effects twice; the second mount is the same visit
    // unless a click (a new navigation) happened between them.
    const last = visits[visits.length - 1];
    if (last && last.route === route && mountAt - last.mountAt < 1000 && (lastClick === null || lastClick.t <= last.mountAt)) return;
    const firstOfDocument = visits.length === 0 && (lastClick === null || lastClick.t > mountAt);
    let anchor = 0;
    let anchorLabel = 'navigation start (hard load)';
    if (!firstOfDocument && lastClick && mountAt - lastClick.t <= NAV_INTENT_WINDOW_MS) {
        anchor = lastClick.t;
        anchorLabel = `click${lastClick.href ? ` on ${lastClick.href}` : ''} (soft navigation)`;
    } else if (!firstOfDocument) {
        anchor = mountAt;
        anchorLabel = 'route mount (no navigating click seen)';
    }
    const visit = { route, mountAt, anchor, anchorLabel };
    push(visits, visit);
    record(`${route}:route-mount`, { anchor: round(anchor) }, true, mountAt);
    // A load that never paints rows (stuck, failed, empty) still gets a
    // report — "NOT REACHED", with whatever is in flight — after 30s.
    setTimeout(() => {
        if (printed.has(visit) || visits[visits.length - 1] !== visit) return;
        report(route);
    }, STUCK_REPORT_MS);
}
const STUCK_REPORT_MS = 30_000;

/** Navigation Timing of the document, as milestones (hard loads only). */
function navigationMilestones(): PerfMilestone[] {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (!nav) return [];
    return [
        { name: 'nav:ttfb', t: nav.responseStart },
        { name: 'nav:dcl', t: nav.domContentLoadedEventEnd || nav.domContentLoadedEventStart },
    ].filter((m) => m.t > 0);
}

export const ORDERS_CHECKPOINTS: readonly CheckpointDef[] = [
    { name: 'nav:ttfb', label: 'HTML document (TTFB)' },
    { name: 'nav:dcl', label: 'HTML parse + blocking JS (DOMContentLoaded)' },
    { name: 'auth:init', label: 'Hydration: app shell mounted' },
    { name: 'orders:route-mount', label: 'Orders route JS loaded + mounted' },
    { name: 'auth:session', label: 'Auth: session read from cookie' },
    { name: 'auth:profile-row', label: 'Auth: user_profiles row → tenant known' },
    { name: 'orders:filters-settled', label: 'Saved filters applied' },
    { name: 'orders:snapshot-checked', label: 'sessionStorage snapshot check' },
    { name: 'orders:queryfn-start', label: 'Query enabled → queryFn starts' },
    { name: 'list:watermark', label: 'Sync watermark read (1 req, serial)' },
    { name: 'list:head', label: 'List head: newest 50 + pinned + count (wide windows)' },
    { name: 'orders:preview-data', label: 'Head published as preview' },
    { name: 'list:count', label: 'Order row count (HEAD, narrow windows)' },
    { name: 'list:pages', label: 'Order pages (parallel)' },
    { name: 'list:trust-book', label: 'Trust book, beside the pages (wide windows)' },
    { name: 'sync:list-normalize', label: 'normalizeOrder × rows (CPU)' },
    { name: 'list:trust-rows', label: 'Trust phone lookups' },
    { name: 'sync:list-trust-join', label: 'risk_data join (CPU)' },
    { name: 'orders:queryfn-done', label: 'Stale-contacted resolve + SWR snapshot write' },
    { name: 'orders:content-render', label: 'Data → page content mounted (React + skeleton exit)' },
    { name: 'orders:list-painted', label: 'Content → first rows (or empty state) painted' },
];

const ROUTE_REPORTS: Record<string, { checkpoints: readonly CheckpointDef[]; terminal: string }> = {
    orders: { checkpoints: ORDERS_CHECKPOINTS, terminal: 'orders:list-painted' },
};

export interface RouteReport {
    route: string;
    critical: CriticalPathReport;
    requests: ReturnType<typeof summarizeRequests>;
    /** Every request in the window, start-relative to the anchor. */
    waterfall: Array<{ label: string; method: string; url: string; start: number; headers: number | null; end: number | null; status: number | null; rows: number | null }>;
    longFrames: Array<PerfLongFrame & { at: number }>;
    mainThreadBlockedMs: number;
    reactCommits: { count: number; totalMs: number; slowest: Array<{ id: string; phase: string; ms: number; at: number }> };
    syncBlocks: Array<{ name: string; ms: number; kb?: number; at: number }>;
    milestones: Array<{ name: string; at: number; meta?: Meta }>;
}

/** Build (and return) the report for the latest visit of `route`. */
function buildReport(route: string): RouteReport | null {
    const def = ROUTE_REPORTS[route];
    const visit = [...visits].reverse().find((v) => v.route === route);
    if (!def || !visit) return null;
    resolveRequestEnds();
    const all = visit.anchor === 0 ? [...navigationMilestones(), ...milestones] : [...milestones];
    const critical = buildCriticalPath({
        anchor: visit.anchor,
        anchorLabel: visit.anchorLabel,
        checkpoints: def.checkpoints,
        terminal: def.terminal,
        milestones: all,
        requests,
        longFrames,
    });
    const horizon = critical.totalMs === null ? performance.now() : visit.anchor + critical.totalMs;
    const from = visit.anchor;
    const rel = (t: number) => round(t - from);
    const inWindow = requests.filter((r) => r.start <= horizon && requestEnd(r, horizon) >= from);
    const frames = longFrames.filter((f) => f.start + f.duration >= from && f.start <= horizon);
    const windowCommits = commits.filter((c) => c.commitAt >= from && c.commitAt <= horizon);
    return {
        route,
        critical,
        requests: summarizeRequests(requests, from, horizon),
        waterfall: inWindow
            .slice()
            .sort((a, b) => a.start - b.start)
            .map((r) => ({
                label: r.label,
                method: r.method,
                url: r.url,
                start: rel(r.start),
                headers: r.headersAt === null ? null : rel(r.headersAt),
                end: r.end === null ? null : rel(r.end),
                status: r.status,
                rows: r.rows,
            })),
        longFrames: frames.map((f) => ({ ...f, at: rel(f.start) })),
        mainThreadBlockedMs: round(frames.reduce((n, f) => n + f.blocking, 0)),
        reactCommits: {
            count: windowCommits.length,
            totalMs: round(windowCommits.reduce((n, c) => n + c.ms, 0)),
            slowest: windowCommits
                .slice()
                .sort((a, b) => b.ms - a.ms)
                .slice(0, 5)
                .map((c) => ({ id: c.id, phase: c.phase, ms: round(c.ms), at: rel(c.commitAt) })),
        },
        syncBlocks: milestones
            .filter((m) => m.name.startsWith('sync:') && m.t >= from && m.t <= horizon)
            .map((m) => ({ name: m.name.slice(5), ms: Number(m.meta?.ms ?? 0), kb: m.meta?.kb as number | undefined, at: rel(m.t) })),
        milestones: all
            .filter((m) => m.t >= from && m.t <= horizon + 2000)
            .sort((a, b) => a.t - b.t)
            .map((m) => ({ name: m.name, at: rel(m.t), meta: m.meta })),
    };
}

const printed = new Set<RouteVisit>();

/** Print the latest visit's report to the console (once per visit) and return it. */
function report(route: string): RouteReport | null {
    const r = buildReport(route);
    if (!r || !ACTIVE) return r;
    const visit = [...visits].reverse().find((v) => v.route === route);
    if (visit) printed.add(visit);
    const total = r.critical.totalMs === null ? 'NOT REACHED' : `${Math.round(r.critical.totalMs)} ms`;
    const verdict = r.critical.top
        .map((s) => `${s.label} ${Math.round(s.ms)}ms [${s.kind}]`)
        .join('  ›  ');
    // Intentional console output: this module exists to print this report,
    // and only when tracing is switched on.
    console.groupCollapsed(
        `%c[PerfTrace] /${route} → first rows painted: ${total}%c  from ${r.critical.anchorLabel}`,
        'font-weight:bold;color:#1E1E1E;background:#FBE38E;padding:2px 6px;border-radius:4px',
        'color:#888',
    );
    console.log(`Biggest: ${verdict}`);
    console.table(
        r.critical.segments
            .filter((s) => s.kind !== 'skipped')
            .map((s) => ({
                segment: s.label,
                ms: Math.round(s.ms),
                '%': r.critical.totalMs ? Math.round((100 * s.ms) / r.critical.totalMs) : '',
                'at (ms)': s.at,
                bound: s.kind,
                'cpu ms': Math.round(s.cpuMs),
                'net ms': Math.round(s.netMs),
                'in flight': s.requests.join(', '),
            })),
    );
    console.log('Requests by purpose (ms from anchor):');
    console.table(r.requests);
    if (r.longFrames.length > 0) {
        console.log(`Long frames: ${r.longFrames.length}, input blocked ${Math.round(r.mainThreadBlockedMs)} ms`);
        console.table(
            r.longFrames
                .slice()
                .sort((a, b) => b.duration - a.duration)
                .slice(0, 10)
                .map((f) => ({ 'at (ms)': f.at, ms: Math.round(f.duration), blocking: Math.round(f.blocking), scripts: f.scripts.join(' | ') })),
        );
    }
    if (r.reactCommits.count > 0) {
        console.log(`React commits: ${r.reactCommits.count}, render ${Math.round(r.reactCommits.totalMs)} ms total`);
        console.table(r.reactCommits.slowest);
    }
    if (r.syncBlocks.length > 0) console.table(r.syncBlocks);
    if (r.critical.background.length > 0) console.log(`Off the critical path (finished after rows painted): ${r.critical.background.join(', ')}`);
    console.log('Full report: window.__perfTrace.report(%o)', route);
    console.groupEnd();
    return r;
}

/**
 * Print the route's report `delayMs` after its terminal milestone, so long
 * frames and Resource Timing entries that land just after the paint are in.
 */
function scheduleReport(route: string, delayMs = 1500): void {
    if (!ACTIVE) return;
    const visit = [...visits].reverse().find((v) => v.route === route);
    if (!visit || printed.has(visit)) return;
    printed.add(visit);
    setTimeout(() => report(route), delayMs);
}

/**
 * Record `name` once the browser has painted the current frame — a rAF runs
 * before paint, the task queued from it after — then print `route`'s report.
 * First-wins per route visit: later re-renders do not move it.
 */
function markPainted(name: string, route: string, meta?: Meta): void {
    if (!ACTIVE) return;
    const visit = [...visits].reverse().find((v) => v.route === route);
    if (!visit || painted.has(visit)) return;
    painted.add(visit);
    requestAnimationFrame(() => {
        setTimeout(() => {
            record(name, meta, true);
            scheduleReport(route);
        }, 0);
    });
}
const painted = new Set<RouteVisit>();

function delta(from: string, to: string): number | null {
    const a = milestones.find(m => m.name === from);
    const b = milestones.find(m => m.name === to);
    if (!a || !b) return null;
    return round(b.t - a.t);
}

/** Print the dashboard's critical-path table + headline deltas. Idempotent. */
function summary(): void {
    if (!ACTIVE || summarized || milestones.length === 0) return;
    summarized = true;

    const rows = milestones.map(m => ({
        milestone: m.name,
        't (ms since nav)': round(m.t),
        ...(m.meta ?? {}),
    }));

    const headline = {
        'time-to-first-paint (ms)': milestones.find(m => m.name === 'dashboard:first-paint')?.t.toFixed(1) ?? 'n/a',
        'auth warm cost: init→profile (ms)': delta('auth:init', 'auth:profile-loaded'),
        'orders fetch cost: start→done (ms)': delta('orders:fetch-start', 'orders:fetch-done'),
        'paint gated by orders? (fetch-done→paint ms)': delta('orders:fetch-done', 'dashboard:first-paint'),
    };

    console.log('%c[PerfTrace] Dashboard critical path', 'font-weight:bold;color:#1E1E1E;background:#FBE38E;padding:2px 6px;border-radius:4px');
    console.table(rows);
    console.table(headline);
}

function round(n: number): number {
    return Math.round(n * 10) / 10;
}

export const perfTrace = {
    active: ACTIVE,
    mark,
    markRepeat,
    time,
    span,
    requestStart,
    requestDone,
    reactCommit,
    beginRoute,
    markPainted,
    scheduleReport,
    report,
    summary,
    get: () => ({
        active: ACTIVE,
        milestones: [...milestones],
        requests: requests.map((r): PerfRequest => ({
            label: r.label, method: r.method, url: r.url, start: r.start,
            headersAt: r.headersAt, end: r.end, status: r.status, rows: r.rows,
        })),
        longFrames: [...longFrames],
        commits: [...commits],
        visits: [...visits],
        summarized,
    }),
};

// Expose for manual inspection / scripted capture.
if (isBrowser && ACTIVE) {
    (window as unknown as { __perfTrace: typeof perfTrace }).__perfTrace = perfTrace;
    observeMainThread();
    observeClicks();
}
