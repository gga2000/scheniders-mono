"use client";

import Link from "next/link";
import { HeartPulse, AlertTriangle, CheckCircle2, ArrowRight, Rocket } from "lucide-react";
import { runHealthChecks, emptyStoreConfigV2 } from "@scheniders/shared";
import type { LocaleCode, StoreConfigV2, FixAction } from "@scheniders/shared";
import { STRINGS, t, tFormat, type EditorString } from "@/lib/editor-i18n";
import { checkCopyFixLabel, checkCopyMessage } from "@/lib/health-check-copy";

interface HealthCardProps {
    config: StoreConfigV2 | null;
    /** A brand-new store (not published, nothing built) has no meaningful health
     * to score — show a neutral onboarding prompt instead of a red "failing" label. */
    isBrandNew?: boolean;
    /** Hub chrome locale — the store's `default_locale` (UX2-14). */
    locale: LocaleCode;
}

/**
 * Turn a health check's fix target into an editor deep-link so "Fix" lands the
 * merchant on the exact screen/page/section instead of the editor default.
 * (BUG36 — the rules engine already computes `fix_action.go_to`.)
 */
function fixHref(fix: FixAction | undefined): string {
    const go = fix?.go_to;
    if (!go) return "/store/edit";
    switch (go.kind) {
        case "settings":
            // "health" is an inline tab, not a deep-linkable screen.
            return go.key === "health"
                ? "/store/edit"
                : `/store/edit?screen=${go.key}`;
        case "page":
            return `/store/edit?page=${go.page_id}`;
        case "section":
            return `/store/edit?page=${go.page_id}&section=${go.section_id}`;
        case "external":
            return go.href;
        default:
            return "/store/edit";
    }
}

function scoreColor(score: number): string {
    if (score < 40) return "#ef4444";
    if (score < 70) return "#f59e0b";
    if (score < 85) return "#22d3a5";
    return "#16a34a";
}

function scoreLabel(score: number): EditorString {
    if (score < 40) return STRINGS.command_center.health_score_needs_attention;
    if (score < 70) return STRINGS.command_center.health_score_getting_there;
    if (score < 85) return STRINGS.command_center.health_score_looking_good;
    return STRINGS.command_center.health_score_launch_ready;
}

/** Simple SVG ring showing the score 0–100. */
function ScoreRing({ score }: { score: number }) {
    const r = 32;
    const circ = 2 * Math.PI * r;
    const filled = (score / 100) * circ;
    const color = scoreColor(score);

    return (
        <svg width="80" height="80" viewBox="0 0 80 80" className="shrink-0">
            <circle
                cx="40" cy="40" r={r} fill="none"
                stroke="currentColor" strokeWidth="8"
                className="text-muted/30"
            />
            <circle
                cx="40" cy="40" r={r} fill="none"
                stroke={color} strokeWidth="8"
                strokeDasharray={`${filled} ${circ}`}
                strokeLinecap="round"
                transform="rotate(-90 40 40)"
                style={{ transition: "stroke-dasharray 0.6s ease" }}
            />
            <text x="40" y="44" textAnchor="middle" fontSize="16" fontWeight="700" fill={color}>
                {score}
            </text>
        </svg>
    );
}

export function HealthCard({ config, isBrandNew = false, locale }: HealthCardProps) {
    if (isBrandNew) {
        return (
            <div className="rounded-2xl border border-border bg-(--card-bg) shadow-(--card-shadow) p-6">
                <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                        <Rocket className="w-4 h-4 text-violet-700" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground">
                        {t(STRINGS.command_center.health_new_store_heading, locale)}
                    </h3>
                </div>
                <p className="text-sm text-muted-foreground mb-5">
                    {t(STRINGS.command_center.health_new_store_body, locale)}
                </p>
                <Link
                    href="/store/onboarding"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background shadow-(--card-shadow) transition-all duration-150 hover:-translate-y-px hover:shadow-(--card-shadow-hover)"
                >
                    {t(STRINGS.command_center.health_get_started, locale)} <ArrowRight className="w-3.5 h-3.5" />
                </Link>
            </div>
        );
    }

    const report = runHealthChecks(config ?? emptyStoreConfigV2());
    const { score, checks } = report;

    // Top 4 failing or warning checks
    const issues = checks
        .filter((c) => c.status !== "pass")
        .sort((a, b) => {
            const order: Record<string, number> = { fail: 0, warn: 1 };
            return (order[a.status] ?? 2) - (order[b.status] ?? 2);
        })
        .slice(0, 4);

    return (
        <div className="rounded-2xl border border-border bg-(--card-bg) shadow-(--card-shadow) p-6">
            <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <HeartPulse className="w-4 h-4 text-emerald-700" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                    {t(STRINGS.command_center.health_heading, locale)}
                </h3>
            </div>

            <div className="flex items-start gap-4 mb-5">
                <ScoreRing score={score} />
                <div className="flex flex-col justify-center gap-1">
                    <p className="text-sm font-semibold text-foreground">{t(scoreLabel(score), locale)}</p>
                    <p className="text-xs text-muted-foreground">
                        {issues.length === 0
                            ? t(STRINGS.command_center.health_all_passing_detail, locale)
                            : tFormat(
                                  issues.length === 1
                                      ? STRINGS.command_center.health_items_to_address_one
                                      : STRINGS.command_center.health_items_to_address_other,
                                  locale,
                                  { n: issues.length },
                              )}
                    </p>
                </div>
            </div>

            {issues.length > 0 && (
                <div className="space-y-2">
                    {issues.map((check) => (
                        <div key={check.id} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-muted/40 border border-border/50">
                            <AlertTriangle
                                className={
                                    check.status === "fail"
                                        ? "w-4 h-4 text-rose-500 mt-0.5 shrink-0"
                                        : "w-4 h-4 text-amber-500 mt-0.5 shrink-0"
                                }
                            />
                            <p className="text-xs text-foreground flex-1">
                                {checkCopyMessage(check.id, check.message ?? check.id, locale)}
                            </p>
                            <Link
                                href={fixHref(check.fix_action)}
                                /* The chip stays a compact "Fix"; the specific localized
                                 * action ("Edit privacy policy") is exposed as its
                                 * accessible name so the target is never ambiguous. */
                                aria-label={checkCopyFixLabel(check.id, check.fix_action?.label, locale)}
                                title={checkCopyFixLabel(check.id, check.fix_action?.label, locale)}
                                className="shrink-0 rounded-lg bg-(--background-soft) px-2 py-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                            >
                                {t(STRINGS.command_center.health_fix, locale)}
                            </Link>
                        </div>
                    ))}
                </div>
            )}

            {issues.length === 0 && (
                <div className="flex items-center gap-2 text-emerald-600">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-xs font-medium">
                        {t(STRINGS.command_center.health_all_passing, locale)}
                    </span>
                </div>
            )}

            <Link
                href="/store/edit"
                className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
                {t(STRINGS.command_center.health_full_checklist, locale)} <ArrowRight className="w-3 h-3" />
            </Link>
        </div>
    );
}
