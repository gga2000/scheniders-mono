"use client";

// =====================================================================
// HealthChecklistScreen — Store Health & Launch Checklist
// =====================================================================
// Renders a big donut score + per-category mini-bars + a filterable list
// of the 30 health checks. Each row's "Fix" button deep-links into the
// editor (settings screen, page, or specific section) via callbacks.
//
// Pure presentation — the rules engine lives in
// `packages/shared/src/health-rules.ts`.
// =====================================================================

import { useMemo, useState, type ReactElement } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ExternalLink } from "lucide-react";
import type {
    FixAction,
    HealthCategory,
    HealthCheck,
    PageId,
    RuleStatus,
    StoreConfigV2,
} from "@scheniders/shared";
import { blockingChecks, runHealthChecks } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import type { SettingsSectionId } from "./page-tree";

/* ─────────────────────────────────────────────────────────────────── */
/* Props                                                               */
/* ─────────────────────────────────────────────────────────────────── */

export interface HealthChecklistScreenProps {
    config: StoreConfigV2;
    tenantName: string;
    /** Open a settings screen (brand_kit etc.). */
    onSelectSetting: (id: SettingsSectionId) => void;
    /** Navigate to a page. The host should also close the health view. */
    onSelectPage: (page_id: PageId) => void;
    /** Open a specific section's edit panel on a page. */
    onSelectSection?: (page_id: PageId, section_id: string) => void;
    /** Close the health screen and return to the live preview. */
    onClose?: () => void;
}

type Filter = "all" | "failing" | "warn" | "passing";

/* ─────────────────────────────────────────────────────────────────── */
/* Category metadata                                                   */
/* ─────────────────────────────────────────────────────────────────── */

const CATEGORY_LABEL: Record<HealthCategory, string> = {
    ad_compliance: "Ad compliance",
    conversion: "Conversion",
    seo: "SEO",
    trust: "Trust",
    content: "Content",
    performance: "Performance",
};

const CATEGORY_ORDER: HealthCategory[] = [
    "ad_compliance",
    "conversion",
    "seo",
    "trust",
    "content",
    "performance",
];

/* ─────────────────────────────────────────────────────────────────── */
/* Visual helpers                                                      */
/* ─────────────────────────────────────────────────────────────────── */

function scoreColor(score: number): string {
    if (score < 40) return "#ef4444"; // red
    if (score < 70) return "#f59e0b"; // amber
    if (score < 85) return "#22d3a5"; // mint
    return "#16a34a"; // green
}

function scoreLabel(score: number): string {
    if (score < 40) return "Needs work";
    if (score < 70) return "Almost there";
    if (score < 85) return "Ready to launch";
    return "Looking great";
}

function statusDotColor(s: RuleStatus): string {
    if (s === "fail") return "bg-red-500";
    if (s === "warn") return "bg-amber-500";
    return "bg-emerald-500";
}

/* ─────────────────────────────────────────────────────────────────── */
/* Donut                                                               */
/* ─────────────────────────────────────────────────────────────────── */

function ScoreDonut({ score }: { score: number }): ReactElement {
    const size = 156;
    const stroke = 14;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);
    const color = scoreColor(score);
    return (
        <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            data-testid="health-score-donut"
            role="img"
            aria-label={`Store health score ${score} out of 100`}
        >
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="rgba(0,0,0,0.08)"
                strokeWidth={stroke}
            />
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
            <text
                x="50%"
                y="50%"
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="36"
                fontWeight="700"
                fill="currentColor"
                data-testid="health-score-value"
            >
                {score}
            </text>
        </svg>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Component                                                           */
/* ─────────────────────────────────────────────────────────────────── */

export function HealthChecklistScreen(
    props: HealthChecklistScreenProps,
): ReactElement {
    const { config, tenantName, onSelectSetting, onSelectPage, onSelectSection, onClose } = props;

    const report = useMemo(() => runHealthChecks(config), [config]);
    const blocking = useMemo(() => blockingChecks(report), [report]);

    const [filter, setFilter] = useState<Filter>("failing");

    const visibleChecks = useMemo(() => {
        return report.checks.filter((c) => {
            if (filter === "all") return true;
            if (filter === "failing") return c.status === "fail" || c.status === "warn";
            if (filter === "warn") return c.status === "warn";
            return c.status === "pass";
        });
    }, [report.checks, filter]);

    const handleFix = (action: FixAction): void => {
        const go = action.go_to;
        if (go.kind === "settings") {
            onSelectSetting(go.key as SettingsSectionId);
            return;
        }
        if (go.kind === "page") {
            onSelectPage(go.page_id);
            return;
        }
        if (go.kind === "section") {
            if (onSelectSection) onSelectSection(go.page_id, go.section_id);
            else onSelectPage(go.page_id);
            return;
        }
        if (go.kind === "external") {
            if (typeof window !== "undefined") {
                window.open(go.href, "_blank", "noopener,noreferrer");
            }
        }
    };

    return (
        <div
            data-testid="health-checklist-screen"
            className="flex flex-1 flex-col overflow-y-auto bg-(--card-bg)"
        >
            {/* Header */}
            <header className="flex items-center gap-3 border-b border-(--card-border) px-6 py-4">
                {onClose ? (
                    <button
                        type="button"
                        onClick={onClose}
                        data-testid="health-close"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                        aria-label="Close health screen"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                ) : null}
                <div>
                    <h1 className="text-lg font-semibold tracking-tight">Store Health</h1>
                    <p className="text-xs text-foreground/80">
                        {tenantName} — what to fix before launch
                    </p>
                </div>
            </header>

            {/* Score card + categories */}
            <section className="grid gap-6 px-6 py-6 lg:grid-cols-[auto_1fr]">
                <div
                    className="flex flex-col items-center justify-center rounded-2xl border border-(--card-border) bg-background p-6"
                    data-testid="health-score-card"
                >
                    <ScoreDonut score={report.score} />
                    <div className="mt-3 text-center">
                        <div
                            className="text-sm font-semibold"
                            style={{ color: scoreColor(report.score) }}
                            data-testid="health-score-label"
                        >
                            {scoreLabel(report.score)}
                        </div>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            out of 100
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {CATEGORY_ORDER.map((cat) => {
                        const v = report.category_scores[cat];
                        return (
                            <div
                                key={cat}
                                data-testid={`health-cat-${cat}`}
                                className="rounded-xl border border-(--card-border) bg-background p-3"
                            >
                                <div className="flex items-baseline justify-between">
                                    <span className="text-xs font-medium text-foreground/80">
                                        {CATEGORY_LABEL[cat]}
                                    </span>
                                    <span
                                        className="text-sm font-semibold tabular-nums"
                                        style={{ color: scoreColor(v) }}
                                    >
                                        {v}
                                    </span>
                                </div>
                                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                                    <div
                                        className="h-full rounded-full transition-all"
                                        style={{
                                            width: `${v}%`,
                                            background: scoreColor(v),
                                        }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Blocks publish banner */}
            {blocking.length > 0 ? (
                <div
                    data-testid="health-blocks-publish"
                    className="sticky top-0 z-10 mx-6 mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
                >
                    <AlertTriangle className="h-4 w-4" />
                    <span className="font-semibold">
                        Blocks publish ({blocking.length})
                    </span>
                    <span className="text-red-600/80">
                        — fix these before you can publish.
                    </span>
                </div>
            ) : null}

            {/* Filter chips */}
            <div className="flex flex-wrap items-center gap-2 px-6 pb-3">
                {(["all", "failing", "warn", "passing"] as const).map((f) => (
                    <button
                        key={f}
                        type="button"
                        data-testid={`health-filter-${f}`}
                        onClick={() => setFilter(f)}
                        className={cn(
                            "rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors",
                            filter === f
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-(--card-border) text-muted-foreground hover:bg-muted/40",
                        )}
                    >
                        {f === "failing" ? "Failing + Warn" : f}
                    </button>
                ))}
                <span className="ml-auto text-xs text-muted-foreground">
                    {visibleChecks.length} of {report.checks.length} checks
                </span>
            </div>

            {/* Check list */}
            <ul
                data-testid="health-check-list"
                className="flex flex-col divide-y divide-(--card-border) border-t border-(--card-border)"
            >
                {visibleChecks.map((c) => (
                    <HealthCheckRow
                        key={c.id}
                        check={c}
                        onFix={handleFix}
                    />
                ))}
                {visibleChecks.length === 0 ? (
                    <li className="flex items-center gap-2 px-6 py-8 text-sm text-foreground/80">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        No checks match this filter — nice work.
                    </li>
                ) : null}
            </ul>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Row                                                                 */
/* ─────────────────────────────────────────────────────────────────── */

function HealthCheckRow({
    check,
    onFix,
}: {
    check: HealthCheck & {
        status: RuleStatus;
        message?: string;
        fix_action?: FixAction;
        blocks_publish?: boolean;
    };
    onFix: (action: FixAction) => void;
}): ReactElement {
    return (
        <li
            data-testid={`health-check-row-${check.id}`}
            data-status={check.status}
            className="flex items-start gap-3 px-6 py-3"
        >
            <span
                aria-hidden="true"
                className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", statusDotColor(check.status))}
            />
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{humanize(check.id)}</span>
                    <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {CATEGORY_LABEL[check.category]}
                    </span>
                    {check.blocks_publish && check.status === "fail" ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                            Blocks publish
                        </span>
                    ) : null}
                </div>
                {check.message ? (
                    <p className="mt-0.5 text-xs text-foreground/80">{check.message}</p>
                ) : null}
            </div>
            {check.fix_action ? (
                <button
                    type="button"
                    data-testid={`health-fix-${check.id}`}
                    onClick={() => onFix(check.fix_action!)}
                    className="shrink-0 inline-flex items-center gap-1 rounded-md border border-(--card-border) px-3 py-1.5 text-xs font-medium hover:bg-muted/40"
                >
                    {check.fix_action.label}
                    {check.fix_action.go_to.kind === "external" ? (
                        <ExternalLink className="h-3 w-3" />
                    ) : null}
                </button>
            ) : null}
        </li>
    );
}

function humanize(id: string): string {
    return id
        .replace(/_/g, " ")
        .replace(/\b\w/g, (m) => m.toUpperCase());
}
