// ---------------------------------------------------------------------------
// Performance Trace — auth + dashboard-load instrumentation
//
// Purpose: capture a hard, reproducible BEFORE/AFTER baseline of what actually
// gates the dashboard's first paint, so we can prove (not assume) where the
// time goes. Records milestone timestamps (ms since navigation start) plus the
// cost of the synchronous JSON serialize/parse of the orders SWR cache and the
// orders payload size.
//
// Active in development, or in any build when `localStorage.perfTrace === '1'`
// (so a production-like build can be measured on demand). Zero cost otherwise:
// every entry point no-ops when inactive.
//
// Read the result live in the browser console as a table, or programmatically
// via `window.__perfTrace.get()`.
// ---------------------------------------------------------------------------

type Meta = Record<string, number | string | boolean>;

interface Milestone {
    name: string;
    t: number; // ms since navigation start (performance.now())
    meta?: Meta;
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

// First-wins milestone store: we care about the FIRST load's critical path,
// not subsequent refetches. Repeated marks of the same name are ignored unless
// `allowDup` is set.
const milestones: Milestone[] = [];
const seen = new Set<string>();
let summarized = false;

function record(name: string, meta?: Meta, allowDup = false): void {
    if (!ACTIVE) return;
    if (!allowDup && seen.has(name)) return;
    seen.add(name);
    const t = performance.now();
    milestones.push({ name, t, meta });
    try {
        performance.mark(`perf:${name}`);
    } catch {
        /* performance.mark unsupported — ignore */
    }
    // Auto-emit the summary the first time the dashboard paints…
    if (name === 'dashboard:first-paint') queueMicrotask(summary);
    // …or, as a fallback on non-dashboard pages, ~2s after the orders fetch
    // completes (gives the synchronous SWR serialize/parse time to record).
    if (name === 'orders:fetch-done') setTimeout(summary, 2000);
}

/** Record a milestone (first occurrence wins). */
function mark(name: string, meta?: Meta): void {
    record(name, meta, false);
}

/** Record a milestone that may legitimately repeat (e.g. a refetch). */
function markRepeat(name: string, meta?: Meta): void {
    record(name, meta, true);
}

/**
 * Time a SYNCHRONOUS block (the thing that blocks the main thread) and record
 * its duration. Returns the block's value. `bytesOf` optionally records the
 * serialized size of the result so we can attribute payload weight.
 */
function time<T>(name: string, fn: () => T, bytesOf?: (r: T) => number): T {
    if (!ACTIVE) return fn();
    const t0 = performance.now();
    const result = fn();
    const dur = performance.now() - t0;
    const meta: Meta = { ms: Number(dur.toFixed(1)) };
    if (bytesOf) {
        try {
            meta.kb = Number((bytesOf(result) / 1024).toFixed(1));
        } catch {
            /* ignore sizing errors */
        }
    }
    record(`sync:${name}`, meta, true);
    return result;
}

function delta(from: string, to: string): number | null {
    const a = milestones.find(m => m.name === from);
    const b = milestones.find(m => m.name === to);
    if (!a || !b) return null;
    return Number((b.t - a.t).toFixed(1));
}

/** Print the captured critical-path table + headline deltas. Idempotent. */
function summary(): void {
    if (!ACTIVE || summarized || milestones.length === 0) return;
    summarized = true;

    const rows = milestones.map(m => ({
        milestone: m.name,
        't (ms since nav)': Number(m.t.toFixed(1)),
        ...(m.meta ?? {}),
    }));

    const headline = {
        'time-to-first-paint (ms)': milestones.find(m => m.name === 'dashboard:first-paint')?.t.toFixed(1) ?? 'n/a',
        'auth warm cost: init→profile (ms)': delta('auth:init', 'auth:profile-loaded'),
        'orders fetch cost: start→done (ms)': delta('orders:fetch-start', 'orders:fetch-done'),
        'paint gated by orders? (fetch-done→paint ms)': delta('orders:fetch-done', 'dashboard:first-paint'),
    };

    // eslint-disable-next-line no-console
    console.log('%c[PerfTrace] Dashboard critical path', 'font-weight:bold;color:#1E1E1E;background:#FBE38E;padding:2px 6px;border-radius:4px');
    // eslint-disable-next-line no-console
    console.table(rows);
    // eslint-disable-next-line no-console
    console.table(headline);
}

export const perfTrace = {
    mark,
    markRepeat,
    time,
    summary,
    get: () => ({ active: ACTIVE, milestones: [...milestones], summarized }),
};

// Expose for manual inspection / scripted capture.
if (isBrowser && ACTIVE) {
    (window as unknown as { __perfTrace: typeof perfTrace }).__perfTrace = perfTrace;
}
