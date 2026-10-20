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
import { blockingChecks, runHealthChecks } from "@scheniders/shared/health-rules";
import { cn } from "@/lib/utils";
import { STRINGS, t, tFormat } from "@/lib/editor-i18n";
import { useResolvedEditorLocale } from "@/lib/editor-locale-context";
import { useEditorMode } from "@/lib/editor-mode-context";
import { CHECK_COPY, checkCopyFixLabel } from "@/lib/health-check-copy";
import type { LocaleCode } from "@scheniders/shared";
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
    /**
     * Whether the store has ever been published — drives the ordered
     * first-launch checklist's final step. Omitted = step hidden.
     */
    hasPublished?: boolean;
    /**
     * Persist the store-level WhatsApp number (`commerce.whatsapp_number`).
     * When provided, the checklist's WhatsApp step captures the number
     * inline instead of navigating anywhere (S3-01).
     */
    onSetWhatsappNumber?: (value: string) => void;
    /**
     * Persist the default delivery fee (`commerce.shipping.default_rate`).
     * When provided AND the fee is unset, a launch step captures it inline
     * (S3-09 — the question moved here from the onboarding wizard).
     */
    onSetDeliveryFee?: (feeIqd: number) => void;
}

type Filter = "all" | "failing" | "warn" | "passing";

/* ─────────────────────────────────────────────────────────────────── */
/* Category metadata                                                   */
/* ─────────────────────────────────────────────────────────────────── */

const CATEGORY_LABEL = {
    ad_compliance: STRINGS.health.cat_ad_compliance,
    conversion: STRINGS.health.cat_conversion,
    seo: STRINGS.health.cat_seo,
    trust: STRINGS.health.cat_trust,
    content: STRINGS.health.cat_content,
    performance: STRINGS.health.cat_performance,
} as const;

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

function scoreLabel(score: number, locale: LocaleCode): string {
    if (score < 40) return t(STRINGS.health.score_needs_work, locale);
    if (score < 70) return t(STRINGS.health.score_almost, locale);
    if (score < 85) return t(STRINGS.health.score_ready, locale);
    return t(STRINGS.health.score_great, locale);
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
    const { config, tenantName, onSelectSetting, onSelectPage, onSelectSection, onClose, hasPublished, onSetWhatsappNumber, onSetDeliveryFee } = props;
    const locale = useResolvedEditorLocale();
    // S3-03: Simple mode shows the launch checklist (+ any publish blockers)
    // only — the score donut, dimension cards, filters and the 36-check list
    // are Advanced surfaces.
    const { mode, setMode } = useEditorMode();
    const isSimple = mode === "simple";

    const report = useMemo(() => runHealthChecks(config), [config]);
    const blocking = useMemo(() => blockingChecks(report), [report]);

    const [filter, setFilter] = useState<Filter>("failing");

    /* ── Inline WhatsApp capture (S3-01) ────────────────────────────
     * The number lives at `commerce.whatsapp_number`; navigating away to
     * "fix" it was a dead end. Capture it right inside the step row. */
    const [waOpen, setWaOpen] = useState(false);
    const [waValue, setWaValue] = useState("");
    const [waError, setWaError] = useState(false);
    const saveWhatsapp = (): void => {
        const cleaned = waValue.replace(/[\s-]/g, "");
        if (!/^\+?\d{10,14}$/.test(cleaned)) {
            setWaError(true);
            return;
        }
        setWaError(false);
        setWaOpen(false);
        onSetWhatsappNumber?.(cleaned);
    };

    /* ── Inline delivery-fee capture (S3-09) ────────────────────────
     * The wizard no longer asks; the step exists only while unset (plus
     * the session it was just completed in, so the strikethrough lands). */
    // Presence, not a positive number: `{ fee_iqd: 0 }` is a merchant who
    // chose free delivery (live scheniders-iraq stores exactly that), so
    // only a missing default_rate means the question is still open.
    const deliveryFeeSet = config.commerce?.shipping?.default_rate != null;
    const [feeOpen, setFeeOpen] = useState(false);
    const [feeValue, setFeeValue] = useState("");
    const [feeError, setFeeError] = useState(false);
    const [feeJustSet, setFeeJustSet] = useState(false);
    const saveDeliveryFee = (): void => {
        const raw = feeValue.replace(/[,\s]/g, "");
        const n = Number(raw);
        // 0 is valid (free delivery); empty, negative or fractional is not.
        if (raw === "" || !Number.isInteger(n) || n < 0) {
            setFeeError(true);
            return;
        }
        setFeeError(false);
        setFeeOpen(false);
        setFeeJustSet(true);
        onSetDeliveryFee?.(n);
    };

    /* ── First-launch ordered checklist (2.3) ───────────────────────
     * Reframes the scariest surface into a guided "do these 5 things"
     * path for a first-week merchant, derived from the existing rules
     * engine (zero new checks). Hidden once everything is done. */
    const launchSteps = useMemo(() => {
        const byId = new Map(report.checks.map((c) => [c.id, c]));
        const pass = (id: string): boolean => byId.get(id)?.status === "pass";
        const fixOf = (id: string) => byId.get(id)?.fix_action ?? null;
        const policiesDone =
            pass("privacy_policy_has_content") &&
            pass("shipping_policy_has_content") &&
            pass("returns_policy_has_content") &&
            pass("terms_has_content");
        const steps: Array<{
            key: string;
            label: string;
            done: boolean;
            fix: FixAction | null;
            checkId?: string;
            hint?: string;
        }> = [
            {
                key: "logo",
                label: t(STRINGS.health.launch_step_logo, locale),
                done: pass("logo_uploaded"),
                fix: fixOf("logo_uploaded"),
            },
            {
                key: "whatsapp",
                label: t(STRINGS.health.launch_step_whatsapp, locale),
                done: pass("whatsapp_number_set"),
                fix: fixOf("whatsapp_number_set"),
                checkId: "whatsapp_number_set",
            },
            // S3-09: delivery fee moved out of the wizard — the step shows
            // only while unset (or right after inline completion).
            ...(onSetDeliveryFee && (!deliveryFeeSet || feeJustSet)
                ? [
                      {
                          key: "delivery",
                          label: t(STRINGS.health.launch_step_delivery, locale),
                          done: deliveryFeeSet,
                          fix: null,
                      },
                  ]
                : []),
            {
                key: "home",
                label: t(STRINGS.health.launch_step_home, locale),
                done: pass("home_has_content"),
                fix: fixOf("home_has_content"),
            },
            {
                key: "policies",
                label: t(STRINGS.health.launch_step_policies, locale),
                done: policiesDone,
                fix:
                    fixOf("shipping_policy_has_content") ??
                    fixOf("privacy_policy_has_content"),
            },
        ];
        if (hasPublished !== undefined) {
            steps.push({
                key: "publish",
                label: t(STRINGS.health.launch_step_publish, locale),
                done: hasPublished,
                fix: null,
                hint: t(STRINGS.health.launch_step_publish_hint, locale),
            });
        }
        return steps;
    }, [report.checks, hasPublished, locale, onSetDeliveryFee, deliveryFeeSet, feeJustSet]);
    const launchDone = launchSteps.filter((s) => s.done).length;
    // Simple keeps the card visible even when complete (it IS the Simple
    // health surface); Advanced hides it once everything is done.
    const showLaunchCard = isSimple || launchDone < launchSteps.length;

    const visibleChecks = useMemo(() => {
        return report.checks.filter((c) => {
            if (filter === "all") return true;
            if (filter === "failing") return c.status === "fail" || c.status === "warn";
            if (filter === "warn") return c.status === "warn";
            return c.status === "pass";
        });
    }, [report.checks, filter]);

    /* UX2-03: a page-level fix while already ON that page changes nothing
     * visible — a dead-end for the merchant. When the rule targets a field
     * that lives on a section (wa_number), pinpoint the section and open
     * its edit panel instead. */
    const findWhatsappTarget = (): { page: PageId; sectionId: string } | null => {
        const pages = Object.entries(config.pages ?? {}) as Array<[
            PageId,
            { sections?: Array<{ id: string; base?: Record<string, unknown> }> },
        ]>;
        for (const [pageId, page] of pages) {
            for (const sec of page.sections ?? []) {
                const base = sec.base ?? {};
                for (const k of Object.keys(base)) {
                    if (/^wa_number$|^whatsapp_number$|^whatsapp$/.test(k)) {
                        return { page: pageId, sectionId: sec.id };
                    }
                }
            }
        }
        return null;
    };

    const handleFix = (action: FixAction, checkId?: string): void => {
        // The number lives at commerce.whatsapp_number — capture it inline
        // in the launch card instead of navigating (S3-01).
        if (checkId === "whatsapp_number_set" && onSetWhatsappNumber) {
            setWaOpen(true);
            return;
        }
        if (checkId === "whatsapp_number_set" && onSelectSection) {
            const target = findWhatsappTarget();
            if (target) {
                onSelectSection(target.page, target.sectionId);
                return;
            }
        }
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
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                        aria-label={t(STRINGS.health.close, locale)}
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                ) : null}
                <div>
                    <h1 className="text-lg font-semibold tracking-tight">
                        {t(STRINGS.health.heading, locale)}
                    </h1>
                    <p className="text-xs text-foreground/80">
                        {tFormat(STRINGS.health.subtitle, locale, { tenant: tenantName })}
                    </p>
                </div>
            </header>

            {/* First-launch ordered checklist */}
            {showLaunchCard && (
                <section className="px-6 pt-6" data-testid="health-launch-steps">
                    <div className="rounded-2xl border border-(--card-border) bg-background p-4 shadow-(--card-shadow)">
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <h2 className="text-sm font-bold text-foreground">
                                {t(STRINGS.health.launch_title, locale)}
                            </h2>
                            <span className="text-[11px] font-semibold text-muted-foreground">
                                {tFormat(STRINGS.health.launch_progress, locale, {
                                    done: launchDone,
                                    total: launchSteps.length,
                                })}
                            </span>
                        </div>
                        <ol className="space-y-1.5">
                            {launchSteps.map((step, i) => (
                                <li
                                    key={step.key}
                                    data-testid={`health-launch-step-${step.key}`}
                                    data-done={step.done ? "true" : "false"}
                                    className={cn(
                                        "flex flex-wrap items-center gap-2.5 rounded-xl border px-3 py-2",
                                        step.done
                                            ? "border-emerald-500/30 bg-emerald-500/5"
                                            : "border-(--card-border)",
                                    )}
                                >
                                    {step.done ? (
                                        <CheckCircle2
                                            className="h-4 w-4 shrink-0 text-emerald-600"
                                            aria-hidden="true"
                                        />
                                    ) : (
                                        <span
                                            aria-hidden="true"
                                            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-(--card-border) text-[9px] font-bold text-muted-foreground"
                                        >
                                            {i + 1}
                                        </span>
                                    )}
                                    <span
                                        className={cn(
                                            "min-w-0 flex-1 truncate text-sm",
                                            step.done
                                                ? "text-muted-foreground line-through decoration-emerald-500/40"
                                                : "text-foreground",
                                        )}
                                    >
                                        {step.label}
                                    </span>
                                    {!step.done &&
                                        (step.fix ||
                                            (step.key === "whatsapp" && onSetWhatsappNumber) ||
                                            (step.key === "delivery" && onSetDeliveryFee)) && (
                                        <button
                                            type="button"
                                            data-testid={`health-launch-fix-${step.key}`}
                                            onClick={() => {
                                                if (step.key === "whatsapp" && onSetWhatsappNumber) {
                                                    setWaOpen((v) => !v);
                                                    return;
                                                }
                                                if (step.key === "delivery" && onSetDeliveryFee) {
                                                    setFeeOpen((v) => !v);
                                                    return;
                                                }
                                                if (step.fix) handleFix(step.fix, step.checkId);
                                            }}
                                            className="inline-flex h-7 shrink-0 items-center rounded-lg bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                                        >
                                            {t(STRINGS.health.launch_fix, locale)}
                                        </button>
                                    )}
                                    {!step.done && !step.fix && step.hint && (
                                        <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:block">
                                            {step.hint}
                                        </span>
                                    )}
                                    {step.key === "whatsapp" &&
                                        !step.done &&
                                        waOpen &&
                                        onSetWhatsappNumber && (
                                        <div className="w-full" data-testid="health-launch-whatsapp-inline">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="tel"
                                                    inputMode="tel"
                                                    value={waValue}
                                                    onChange={(e) => {
                                                        setWaValue(e.target.value);
                                                        setWaError(false);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") saveWhatsapp();
                                                    }}
                                                    placeholder={t(
                                                        STRINGS.health.launch_whatsapp_placeholder,
                                                        locale,
                                                    )}
                                                    aria-label={t(
                                                        STRINGS.health.launch_step_whatsapp,
                                                        locale,
                                                    )}
                                                    className="h-8 min-w-0 flex-1 rounded-lg border border-(--card-border) bg-background px-2.5 text-sm outline-none focus:border-primary"
                                                />
                                                <button
                                                    type="button"
                                                    data-testid="health-launch-whatsapp-save"
                                                    onClick={saveWhatsapp}
                                                    className="inline-flex h-8 shrink-0 items-center rounded-lg bg-primary px-3 text-[11px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                                                >
                                                    {t(STRINGS.health.launch_whatsapp_save, locale)}
                                                </button>
                                            </div>
                                            {waError && (
                                                <p className="mt-1 text-[11px] text-red-600" role="alert">
                                                    {t(STRINGS.health.launch_whatsapp_invalid, locale)}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                    {step.key === "delivery" &&
                                        !step.done &&
                                        feeOpen &&
                                        onSetDeliveryFee && (
                                        <div className="w-full" data-testid="health-launch-delivery-inline">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    inputMode="numeric"
                                                    min={0}
                                                    value={feeValue}
                                                    onChange={(e) => {
                                                        setFeeValue(e.target.value);
                                                        setFeeError(false);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") saveDeliveryFee();
                                                    }}
                                                    placeholder={t(
                                                        STRINGS.health.launch_delivery_placeholder,
                                                        locale,
                                                    )}
                                                    aria-label={t(
                                                        STRINGS.health.launch_step_delivery,
                                                        locale,
                                                    )}
                                                    className="h-8 min-w-0 flex-1 rounded-lg border border-(--card-border) bg-background px-2.5 text-sm outline-none focus:border-primary"
                                                />
                                                <button
                                                    type="button"
                                                    data-testid="health-launch-delivery-save"
                                                    onClick={saveDeliveryFee}
                                                    className="inline-flex h-8 shrink-0 items-center rounded-lg bg-primary px-3 text-[11px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                                                >
                                                    {t(STRINGS.health.launch_whatsapp_save, locale)}
                                                </button>
                                            </div>
                                            {feeError && (
                                                <p className="mt-1 text-[11px] text-red-600" role="alert">
                                                    {t(STRINGS.health.launch_delivery_invalid, locale)}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ol>
                        {isSimple && launchDone === launchSteps.length && (
                            <p
                                data-testid="health-launch-all-done"
                                className="mt-3 text-sm font-semibold text-emerald-700"
                            >
                                {t(STRINGS.health.launch_all_done, locale)}
                            </p>
                        )}
                    </div>
                </section>
            )}

            {/* Score card + categories — Advanced only (S3-03) */}
            {!isSimple && (
            <section className="grid gap-6 px-6 py-6 lg:grid-cols-[auto_1fr]">
                <div
                    className="flex flex-col items-center justify-center rounded-2xl border border-(--card-border) bg-background p-6 shadow-(--card-shadow)"
                    data-testid="health-score-card"
                >
                    <ScoreDonut score={report.score} />
                    <div className="mt-3 text-center">
                        <div
                            className="text-sm font-semibold"
                            style={{ color: scoreColor(report.score) }}
                            data-testid="health-score-label"
                        >
                            {scoreLabel(report.score, locale)}
                        </div>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            {t(STRINGS.health.out_of_100, locale)}
                        </div>
                    </div>
                </div>

                {/* auto-fit, not viewport breakpoints: this screen lives in a
                    380px rail where lg: classes produced unreadable slivers. */}
                <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
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
                                        {t(CATEGORY_LABEL[cat], locale)}
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
            )}

            {/* Blocks publish banner */}
            {blocking.length > 0 ? (
                <div
                    data-testid="health-blocks-publish"
                    className="sticky top-0 z-10 mx-6 mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                >
                    <AlertTriangle className="h-4 w-4" />
                    <span className="font-semibold">
                        {tFormat(STRINGS.health.blocks_publish, locale, { n: blocking.length })}
                    </span>
                    <span className="text-red-600/80 dark:text-red-300/70">
                        {t(STRINGS.health.blocks_publish_hint, locale)}
                    </span>
                </div>
            ) : null}

            {/* Simple: publish blockers stay actionable; everything else lives
                behind the mode switch. */}
            {isSimple && blocking.length > 0 && (
                <ul
                    data-testid="health-simple-blocking-list"
                    className="flex flex-col divide-y divide-(--card-border) border-t border-(--card-border)"
                >
                    {blocking.map((c) => (
                        <HealthCheckRow key={c.id} check={c} onFix={handleFix} locale={locale} />
                    ))}
                </ul>
            )}
            {isSimple && (
                <div className="px-6 pb-6 pt-3">
                    <button
                        type="button"
                        data-testid="health-simple-advanced-hatch"
                        onClick={() => setMode("advanced")}
                        className="text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                    >
                        {t(STRINGS.mode.more_options, locale)}
                    </button>
                </div>
            )}

            {/* Filter chips — Advanced only */}
            {!isSimple && (
            <div className="flex flex-wrap items-center gap-2 px-6 pb-3">
                {(["all", "failing", "warn", "passing"] as const).map((f) => (
                    <button
                        key={f}
                        type="button"
                        data-testid={`health-filter-${f}`}
                        onClick={() => setFilter(f)}
                        className={cn(
                            "rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-all duration-150",
                            filter === f
                                ? "border-transparent bg-primary text-primary-foreground shadow-(--card-shadow)"
                                : "border-(--card-border) bg-(--background-soft) text-muted-foreground hover:border-(--border-hover) hover:text-foreground",
                        )}
                    >
                        {f === "failing"
                            ? t(STRINGS.health.filter_failing, locale)
                            : f === "all"
                              ? t(STRINGS.health.filter_all, locale)
                              : f === "warn"
                                ? t(STRINGS.health.filter_warn, locale)
                                : t(STRINGS.health.filter_passing, locale)}
                    </button>
                ))}
                <span className="ml-auto text-xs text-muted-foreground">
                    {tFormat(STRINGS.health.checks_count, locale, {
                        visible: visibleChecks.length,
                        total: report.checks.length,
                    })}
                </span>
            </div>
            )}

            {/* Check list — Advanced only */}
            {!isSimple && (
            <ul
                data-testid="health-check-list"
                className="flex flex-col divide-y divide-(--card-border) border-t border-(--card-border)"
            >
                {visibleChecks.map((c) => (
                    <HealthCheckRow
                        key={c.id}
                        check={c}
                        onFix={handleFix}
                        locale={locale}
                    />
                ))}
                {visibleChecks.length === 0 ? (
                    <li className="flex items-center gap-2 px-6 py-8 text-sm text-foreground/80">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        {t(STRINGS.health.no_checks_match, locale)}
                    </li>
                ) : null}
            </ul>
            )}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Row                                                                 */
/* ─────────────────────────────────────────────────────────────────── */

function HealthCheckRow({
    check,
    onFix,
    locale,
}: {
    check: HealthCheck & {
        status: RuleStatus;
        message?: string;
        fix_action?: FixAction;
        blocks_publish?: boolean;
    };
    onFix: (action: FixAction, checkId?: string) => void;
    locale: LocaleCode;
}): ReactElement {
    // Merchant copy first (UX2-02): when we have localized copy for this
    // check it becomes the row title; the engine's English id/message is
    // the fallback for unknown checks only.
    const copy = CHECK_COPY[check.id];
    const title = copy ? t(copy.message, locale) : humanize(check.id);
    const subtitle = copy ? null : check.message;
    return (
        <li
            data-testid={`health-check-row-${check.id}`}
            data-status={check.status}
            className="flex items-start gap-3 px-6 py-3 transition-colors hover:bg-black/2"
        >
            <span
                aria-hidden="true"
                className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", statusDotColor(check.status))}
            />
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{title}</span>
                    <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {t(CATEGORY_LABEL[check.category], locale)}
                    </span>
                    {check.blocks_publish && check.status === "fail" ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:bg-red-500/15 dark:text-red-300">
                            {t(STRINGS.health.blocks_publish_chip, locale)}
                        </span>
                    ) : null}
                </div>
                {subtitle ? (
                    <p className="mt-0.5 text-xs text-foreground/80">{subtitle}</p>
                ) : null}
            </div>
            {check.fix_action ? (
                <button
                    type="button"
                    data-testid={`health-fix-${check.id}`}
                    onClick={() => onFix(check.fix_action!, check.id)}
                    className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-(--card-border) bg-(--background-soft) px-3 py-1.5 text-xs font-medium transition-colors hover:border-(--border-hover) hover:text-foreground"
                >
                    {checkCopyFixLabel(check.id, check.fix_action.label, locale)}
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
