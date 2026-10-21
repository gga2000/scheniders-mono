// /orders load profiler.
//
// Measures how long a merchant waits from navigation (or from clicking the
// sidebar link) until the first order row is painted, and attributes that
// time: the in-app trace (lib/perf-trace.ts) gives the critical path —
// auth, filters, each fetch stage, render — and CDP gives every request's
// bytes and timing. Runs N times per scenario and reports median / p75 / max.
//
//   PERF_EMAIL=you@example.com pnpm --filter @scheniders/platform test:perf:orders
//
// Environment:
//   PERF_EMAIL       account to measure as (required; a magic-link session is
//                    minted with the service-role key — nothing is emailed)
//   PERF_BASE_URL    default http://localhost:3000 (a production URL works too:
//                    without the in-app trace you still get CDP + paint timing)
//   PERF_RUNS        runs per scenario, default 3
//   PERF_SCENARIOS   comma list of cold,reload,soft (default all three)
//   PERF_WINDOW      today | week | month | all | saved (default week: today is
//                    empty for part of every day; saved = the account's own filter)
//   PERF_NETWORK     none | iraq-4g | slow-4g (default none)
//   PERF_CPU         CPU slowdown factor, default 1 (4 ≈ mid-range phone)
//   PERF_TRACE=1     also save a Chrome trace per run (open in DevTools ▸ Performance)
//   PERF_BUDGET_MS   soft budget for the median first-row time, default 5000
//
// Output: console tables, plus test-results/perf/orders-load-<stamp>.{json,md}.

import fs from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { CdpNetwork, NETWORK_PRESETS, type NetworkPreset } from "./cdp-network";
import { groupNetwork, summarize, toMarkdown, type RunResult } from "./report";
import { mintSessionCookies, type PerfCookie } from "./session";
import type { RouteReport } from "../../lib/perf-trace";

const BASE = (process.env.PERF_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.PERF_EMAIL ?? "";
const RUNS = Number(process.env.PERF_RUNS ?? 3);
const SCENARIOS = (process.env.PERF_SCENARIOS ?? "cold,reload,soft").split(",").map((s) => s.trim());
const WINDOW = process.env.PERF_WINDOW ?? "week";
const NETWORK = (process.env.PERF_NETWORK ?? "none") as NetworkPreset;
const CPU = Number(process.env.PERF_CPU ?? 1);
const TRACE = process.env.PERF_TRACE === "1";
const BUDGET_MS = Number(process.env.PERF_BUDGET_MS ?? 5000);
const FIRST_ROW_TIMEOUT_MS = 90_000;
const OUT_DIR = path.resolve(__dirname, "../../test-results/perf");

interface Probe {
    firstRowAt: number | null;
    lastClickAt: number | null;
    fcp: number | null;
    lcp: number | null;
    timeOrigin: number;
}

/**
 * Runs in the page before any app script, on every document. Records — in
 * epoch ms, the clock CDP's records use — the first painted order row, the
 * last click, FCP and LCP; switches the in-app trace on; seeds the list
 * filter so every run fetches the same window.
 */
function probeScript(args: { filterKey: string | null; filterValue: string | null }): void {
    try {
        localStorage.setItem("perfTrace", "1");
        if (args.filterKey && args.filterValue) localStorage.setItem(args.filterKey, args.filterValue);
    } catch {
        /* storage blocked: the trace stays off and the probe still measures */
    }
    const stamp = () => performance.timeOrigin + performance.now();
    const probe: Probe = { firstRowAt: null, lastClickAt: null, fcp: null, lcp: null, timeOrigin: performance.timeOrigin };
    (window as unknown as { __probe: Probe }).__probe = probe;
    let pending = false;
    const check = () => {
        if (probe.firstRowAt !== null || pending || !document.querySelector("[data-order-id], [data-order-row], [data-empty-state]")) return;
        pending = true;
        // rAF runs before the paint; the task it queues runs after it.
        requestAnimationFrame(() => setTimeout(() => {
            pending = false;
            if (probe.firstRowAt === null) probe.firstRowAt = stamp();
        }, 0));
    };
    new MutationObserver(check).observe(document, { subtree: true, childList: true });
    window.addEventListener("click", () => { probe.lastClickAt = stamp(); }, { capture: true });
    try {
        new PerformanceObserver((list) => {
            for (const e of list.getEntries()) if (e.name === "first-contentful-paint") probe.fcp = performance.timeOrigin + e.startTime;
        }).observe({ type: "paint", buffered: true });
        new PerformanceObserver((list) => {
            for (const e of list.getEntries()) probe.lcp = performance.timeOrigin + e.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
        /* paint timing unsupported */
    }
}

function baghdadDay(daysAgo = 0): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date(Date.now() - daysAgo * 86_400_000));
}

function filterSeed(userId: string): { filterKey: string | null; filterValue: string | null } {
    if (WINDOW === "saved") return { filterKey: null, filterValue: null };
    const key = `schneiders_prefs_${userId}_orderFilters`;
    const back = { today: 0, week: 6, month: 29 }[WINDOW];
    if (WINDOW !== "all" && back === undefined) throw new Error(`PERF_WINDOW must be today, week, month, all or saved (got ${WINDOW})`);
    const value = WINDOW === "all" ? { status: "all" } : { status: "all", dateFrom: baghdadDay(back), dateTo: baghdadDay(0) };
    return { filterKey: key, filterValue: JSON.stringify(value) };
}

async function newContext(browser: Browser, cookies: PerfCookie[], userId: string): Promise<BrowserContext> {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: BASE });
    await context.addCookies(cookies);
    await context.addInitScript(probeScript, filterSeed(userId));
    return context;
}

async function waitForFirstRow(page: Page): Promise<number | null> {
    try {
        const handle = await page.waitForFunction(
            () => (window as unknown as { __probe?: Probe }).__probe?.firstRowAt ?? null,
            undefined,
            { timeout: FIRST_ROW_TIMEOUT_MS, polling: 50 },
        );
        return (await handle.jsonValue()) as number;
    } catch {
        return null;
    }
}

async function inAppReport(page: Page): Promise<RouteReport | null> {
    // The app prints its own report 1.5s after the paint; give long frames and
    // Resource Timing the same settle time before reading it.
    await page.waitForTimeout(2000);
    return page.evaluate(() => {
        const t = (window as unknown as { __perfTrace?: { report: (r: string) => unknown } }).__perfTrace;
        return t ? (t.report("orders") as RouteReport | null) : null;
    });
}

async function readProbe(page: Page): Promise<Probe> {
    return page.evaluate(() => (window as unknown as { __probe: Probe }).__probe);
}

function cpuDelta(before: Record<string, number>, after: Record<string, number>): RunResult["cpu"] {
    const d = (k: string) => Math.round(((after[k] ?? 0) - (before[k] ?? 0)) * 1000);
    return { scriptMs: d("ScriptDuration"), taskMs: d("TaskDuration"), layoutMs: d("LayoutDuration"), styleMs: d("RecalcStyleDuration"), heapMb: Math.round((after.JSHeapUsedSize ?? 0) / 1048576) };
}

async function measure(
    page: Page,
    net: CdpNetwork,
    scenario: string,
    run: number,
    act: () => Promise<{ anchor: () => Promise<number>; anchorLabel: string }>,
): Promise<RunResult> {
    const before = await net.metrics();
    if (TRACE) await page.context().browser()?.startTracing(page, { path: path.join(OUT_DIR, `orders-${scenario}-${run}.trace.json`), screenshots: true });
    const { anchor: anchorOf, anchorLabel } = await act();
    const firstRowAt = await waitForFirstRow(page);
    const inApp = await inAppReport(page);
    if (TRACE) await page.context().browser()?.stopTracing();
    const after = await net.metrics();
    const anchor = await anchorOf();
    const probe = await readProbe(page);
    const until = firstRowAt ?? anchor + FIRST_ROW_TIMEOUT_MS;
    const records = net.between(anchor, until);
    const windowMeta = inApp?.milestones.find((m) => m.name === "orders:queryfn-start")?.meta?.window;
    return {
        scenario,
        run,
        totalMs: firstRowAt === null ? null : Math.round(firstRowAt - anchor),
        fcpMs: scenario === "soft" || !probe.fcp ? null : Math.round(probe.fcp - anchor),
        lcpMs: scenario === "soft" || !probe.lcp ? null : Math.round(probe.lcp - anchor),
        anchor: anchorLabel,
        window: typeof windowMeta === "string" ? windowMeta : null,
        inApp,
        net: groupNetwork(records, anchor, until),
        bytesToFirstRow: records.reduce((n, r) => n + r.bytes, 0),
        requestsToFirstRow: records.length,
        cpu: cpuDelta(before, after),
    };
}

function printRun(r: RunResult): void {
    const top = r.inApp?.critical.top.map((t) => `${t.label} ${Math.round(t.ms)}ms [${t.kind}]`).join("  ›  ") ?? "(no in-app trace — instrumentation not deployed at this URL)";
    console.log(`\n[perf] ${r.scenario} #${r.run}: first row ${r.totalMs ?? "NOT PAINTED"} ms (from ${r.anchor}) · window ${r.window ?? "?"} · ${r.requestsToFirstRow} requests · ${(r.bytesToFirstRow / 1024).toFixed(0)} KB`);
    console.log(`       biggest: ${top}`);
    if (r.inApp) {
        console.table(r.inApp.critical.segments.filter((s) => s.kind !== "skipped").map((s) => ({ segment: s.label, ms: Math.round(s.ms), at: s.at, bound: s.kind, cpu: Math.round(s.cpuMs), net: Math.round(s.netMs), inFlight: s.requests.join(",") })));
    }
    console.table(r.net.map((g) => ({ ...g, bytes: `${(g.bytes / 1024).toFixed(0)} KB` })));
}

test.describe("/orders load profile", () => {
    test.describe.configure({ mode: "serial" });
    test.skip(({ browserName }) => browserName !== "chromium", "CDP (network bytes, throttling, tracing) is Chromium-only");
    test.skip(!EMAIL, "set PERF_EMAIL to the account to measure as");
    test.skip(!(NETWORK in NETWORK_PRESETS), `PERF_NETWORK must be one of ${Object.keys(NETWORK_PRESETS).join(", ")}`);

    test("first order row: cold, reload and sidebar navigation", async ({ browser }) => {
        test.setTimeout((RUNS * SCENARIOS.length + 2) * (FIRST_ROW_TIMEOUT_MS + 30_000));
        fs.mkdirSync(OUT_DIR, { recursive: true });
        const { cookies, userId } = await mintSessionCookies(EMAIL, BASE);
        const results: RunResult[] = [];

        // Warm the server once (a dev server compiles routes on first hit) so
        // run 1 is not a compile benchmark. Its numbers are reported separately.
        {
            const context = await newContext(browser, cookies, userId);
            const page = await context.newPage();
            const t0 = Date.now();
            await page.goto("/orders", { waitUntil: "commit" });
            const at = await waitForFirstRow(page);
            console.log(`[perf] warm-up (server compile + caches): first row ${at === null ? "NOT PAINTED" : Math.round(at - t0)} ms`);
            await page.goto("/dashboard", { waitUntil: "load" });
            await context.close();
        }

        for (let run = 1; run <= RUNS; run++) {
            const context = await newContext(browser, cookies, userId);
            const page = await context.newPage();
            const net = await CdpNetwork.attach(page, { network: NETWORK, cpuSlowdown: CPU });

            if (SCENARIOS.includes("cold")) {
                // Fresh context: empty HTTP cache, sessionStorage and React Query.
                const r = await measure(page, net, "cold", run, async () => {
                    await page.goto("/orders", { waitUntil: "commit" });
                    return { anchor: async () => (await readProbe(page)).timeOrigin, anchorLabel: "navigation start" };
                });
                results.push(r);
                printRun(r);
            } else {
                await page.goto("/orders", { waitUntil: "commit" });
                await waitForFirstRow(page);
            }

            if (SCENARIOS.includes("reload")) {
                // Same tab reloaded: warm HTTP cache and the sessionStorage snapshot.
                const r = await measure(page, net, "reload", run, async () => {
                    await page.reload({ waitUntil: "commit" });
                    return { anchor: async () => (await readProbe(page)).timeOrigin, anchorLabel: "navigation start (reload)" };
                });
                results.push(r);
                printRun(r);
            }

            if (SCENARIOS.includes("soft")) {
                // Dashboard first (/dashboard: / opens on Orders), then the sidebar link: a client-side navigation.
                await page.goto("/dashboard", { waitUntil: "load" });
                await page.waitForTimeout(3000);
                const r = await measure(page, net, "soft", run, async () => {
                    await page.evaluate(() => { (window as unknown as { __probe: Probe }).__probe.firstRowAt = null; });
                    await page.locator('a[href="/orders"]').first().click();
                    return {
                        anchor: async () => (await readProbe(page)).lastClickAt ?? Date.now(),
                        anchorLabel: "sidebar click",
                    };
                });
                results.push(r);
                printRun(r);
            }

            await net.detach();
            await context.close();
        }

        const summaries = summarize(results);
        const config = { base: BASE, window: WINDOW, network: NETWORK, cpu: `${CPU}x`, runs: RUNS, at: new Date().toISOString() };
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        fs.writeFileSync(path.join(OUT_DIR, `orders-load-${stamp}.json`), JSON.stringify({ config, summaries, results }, null, 2));
        const md = toMarkdown(summaries, results, config);
        fs.writeFileSync(path.join(OUT_DIR, `orders-load-${stamp}.md`), md);
        console.log(`\n${md}\n[perf] written to ${path.relative(process.cwd(), OUT_DIR)}/orders-load-${stamp}.{json,md}`);

        for (const s of summaries) {
            expect.soft(s.painted, `${s.scenario}: every run should paint a row`).toBe(s.runs);
            expect.soft(s.total.median ?? Infinity, `${s.scenario}: median first-row time (budget ${BUDGET_MS} ms)`).toBeLessThanOrEqual(BUDGET_MS);
        }
    });
});
