// Aggregation and rendering for the perf harness: per-run records in,
// medians / p75 / max per scenario, segment and request label out — as a
// console table and a Markdown file a human can paste into a PR.

import type { NetRecord } from "./cdp-network";
import type { RouteReport } from "../../lib/perf-trace";

export interface RunResult {
    scenario: string;
    run: number;
    /** Anchor (navigation start or click) → first order row painted. Null: never painted. */
    totalMs: number | null;
    fcpMs: number | null;
    lcpMs: number | null;
    anchor: string;
    /** The list window the app fetched (from the in-app trace), e.g. "all" or a day range. */
    window: string | null;
    inApp: RouteReport | null;
    /** Network up to the first row, grouped by purpose. */
    net: NetGroup[];
    bytesToFirstRow: number;
    requestsToFirstRow: number;
    /** Chrome's ScriptDuration / TaskDuration / LayoutDuration deltas over the run, ms. */
    cpu: { scriptMs: number; taskMs: number; layoutMs: number; styleMs: number; heapMb: number };
}

export interface NetGroup {
    label: string;
    count: number;
    bytes: number;
    /** First start → last end, ms from the anchor. */
    firstStart: number;
    lastEnd: number;
    slowestMs: number;
    slowestTtfbMs: number;
    /** Worst browser-side queue/stall/connect before the request left. */
    maxBlockedMs: number;
    /** Worst send → headers (server time + RTT). */
    maxWaitMs: number;
    /** Worst headers → last byte. */
    maxDownloadMs: number;
    protocols: string;
    failed: number;
}

export function quantile(values: number[], q: number): number | null {
    const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    if (v.length === 0) return null;
    const pos = (v.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return Math.round(v[lo] + (v[hi] - v[lo]) * (pos - lo));
}

export function groupNetwork(records: NetRecord[], anchor: number, until: number): NetGroup[] {
    const groups = new Map<string, NetRecord[]>();
    for (const r of records) {
        if (r.start > until) continue;
        const list = groups.get(r.label) ?? [];
        list.push(r);
        groups.set(r.label, list);
    }
    return [...groups.entries()]
        .map(([label, list]) => ({
            label,
            count: list.length,
            bytes: list.reduce((n, r) => n + r.bytes, 0),
            firstStart: Math.round(Math.min(...list.map((r) => r.start)) - anchor),
            lastEnd: Math.round(Math.max(...list.map((r) => r.end ?? until)) - anchor),
            slowestMs: Math.round(Math.max(...list.map((r) => (r.end ?? until) - r.start))),
            slowestTtfbMs: Math.round(Math.max(...list.map((r) => (r.headersAt ?? until) - r.start))),
            maxBlockedMs: Math.round(Math.max(0, ...list.map((r) => r.blockedMs ?? 0))),
            maxWaitMs: Math.round(Math.max(0, ...list.map((r) => r.waitMs ?? 0))),
            maxDownloadMs: Math.round(Math.max(0, ...list.map((r) => r.downloadMs ?? 0))),
            protocols: [...new Set(list.map((r) => r.protocol ?? "?"))].join("/"),
            failed: list.filter((r) => r.failed !== null && r.status === null).length,
        }))
        .sort((a, b) => a.firstStart - b.firstStart);
}

const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
const ms = (n: number | null) => (n === null ? "—" : `${n} ms`);

export interface ScenarioSummary {
    scenario: string;
    runs: number;
    painted: number;
    total: { median: number | null; p75: number | null; max: number | null };
    segments: Array<{ segment: string; median: number | null; p75: number | null; bound: string }>;
    network: Array<{ label: string; count: number | null; bytes: number | null; slowest: number | null; ttfb: number | null; blocked: number | null; wait: number | null; download: number | null; lastEnd: number | null }>;
    cpu: { scriptMs: number | null; taskMs: number | null };
}

export function summarize(results: RunResult[]): ScenarioSummary[] {
    const byScenario = new Map<string, RunResult[]>();
    for (const r of results) byScenario.set(r.scenario, [...(byScenario.get(r.scenario) ?? []), r]);
    return [...byScenario.entries()].map(([scenario, runs]) => {
        const totals = runs.map((r) => r.totalMs).filter((x): x is number => x !== null);
        const segNames: string[] = [];
        for (const r of runs) for (const s of r.inApp?.critical.segments ?? []) if (!segNames.includes(s.label)) segNames.push(s.label);
        const segments = segNames
            .map((label) => {
                const hits = runs.flatMap((r) => r.inApp?.critical.segments.filter((s) => s.label === label) ?? []);
                const kinds = hits.filter((s) => s.kind !== "skipped").map((s) => s.kind);
                const bound = kinds.sort((a, b) => kinds.filter((k) => k === b).length - kinds.filter((k) => k === a).length)[0] ?? "skipped";
                return { segment: label, median: quantile(hits.map((s) => s.ms), 0.5), p75: quantile(hits.map((s) => s.ms), 0.75), bound };
            })
            .filter((s) => (s.p75 ?? 0) > 0);
        const labels = [...new Set(runs.flatMap((r) => r.net.map((g) => g.label)))];
        const network = labels.map((label) => {
            const g = runs.map((r) => r.net.find((x) => x.label === label)).filter((x): x is NetGroup => !!x);
            return {
                label,
                count: quantile(g.map((x) => x.count), 0.5),
                bytes: quantile(g.map((x) => x.bytes), 0.5),
                slowest: quantile(g.map((x) => x.slowestMs), 0.5),
                ttfb: quantile(g.map((x) => x.slowestTtfbMs), 0.5),
                blocked: quantile(g.map((x) => x.maxBlockedMs), 0.5),
                wait: quantile(g.map((x) => x.maxWaitMs), 0.5),
                download: quantile(g.map((x) => x.maxDownloadMs), 0.5),
                lastEnd: quantile(g.map((x) => x.lastEnd), 0.5),
            };
        });
        return {
            scenario,
            runs: runs.length,
            painted: totals.length,
            total: { median: quantile(totals, 0.5), p75: quantile(totals, 0.75), max: totals.length ? Math.max(...totals.map(Math.round)) : null },
            segments,
            network: network.sort((a, b) => (a.lastEnd ?? 0) - (b.lastEnd ?? 0)),
            cpu: { scriptMs: quantile(runs.map((r) => r.cpu.scriptMs), 0.5), taskMs: quantile(runs.map((r) => r.cpu.taskMs), 0.5) },
        };
    });
}

export function toMarkdown(summaries: ScenarioSummary[], results: RunResult[], config: Record<string, string | number>): string {
    const lines: string[] = [];
    lines.push(`# /orders load profile`, "");
    lines.push(Object.entries(config).map(([k, v]) => `**${k}** ${v}`).join(" · "), "");
    for (const s of summaries) {
        lines.push(`## ${s.scenario} — median ${ms(s.total.median)} · p75 ${ms(s.total.p75)} · max ${ms(s.total.max)} (${s.painted}/${s.runs} painted)`, "");
        const windows = [...new Set(results.filter((r) => r.scenario === s.scenario).map((r) => r.window ?? "?"))];
        lines.push(`Window fetched: ${windows.join(", ")} · main-thread script ${ms(s.cpu.scriptMs)} · tasks ${ms(s.cpu.taskMs)}`, "");
        if (s.segments.length > 0) {
            lines.push("| Critical-path segment | median | p75 | bound |", "|---|---:|---:|---|");
            for (const g of s.segments) lines.push(`| ${g.segment} | ${ms(g.median)} | ${ms(g.p75)} | ${g.bound} |`);
            lines.push("");
        }
        lines.push("| Requests before first row | count | bytes | slowest | slowest TTFB | worst browser queue | worst server wait | worst download | done at |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|");
        for (const n of s.network) lines.push(`| ${n.label} | ${n.count ?? "—"} | ${n.bytes === null ? "—" : kb(n.bytes)} | ${ms(n.slowest)} | ${ms(n.ttfb)} | ${ms(n.blocked)} | ${ms(n.wait)} | ${ms(n.download)} | ${ms(n.lastEnd)} |`);
        lines.push("");
    }
    lines.push("## Runs", "", "| scenario | run | first row | FCP | LCP | requests | bytes | biggest segments |", "|---|---:|---:|---:|---:|---:|---:|---|");
    for (const r of results) {
        const top = r.inApp?.critical.top.map((t) => `${t.label} ${Math.round(t.ms)}ms [${t.kind}]`).join("; ") ?? "(no in-app trace)";
        lines.push(`| ${r.scenario} | ${r.run} | ${ms(r.totalMs)} | ${ms(r.fcpMs)} | ${ms(r.lcpMs)} | ${r.requestsToFirstRow} | ${kb(r.bytesToFirstRow)} | ${top} |`);
    }
    return lines.join("\n") + "\n";
}
