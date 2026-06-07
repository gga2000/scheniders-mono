"use client";

// =====================================================================
// PublishConfirmSheet — Builder v2
// =====================================================================
// Side sheet opened when the merchant clicks Publish. Surfaces:
//   1. Changes since the last publish (diff section — top)
//   2. Blocking health warnings (below)
//   3. "Publish anyway" outline button (footer)
//
// Health no longer blocks publish — the merchant stays in control.
// =====================================================================

import { useEffect, useMemo, useState } from "react";
import {
    AlertTriangle,
    ChevronDown,
    ChevronRight,
    Minus,
    Pencil,
    Plus,
    Rocket,
    Sparkles,
    X,
} from "lucide-react";
import type {
    HealthCheck,
    CheckResult,
    PageId,
    StoreConfigV2,
} from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { STRINGS, t, tFormat } from "@/lib/editor-i18n";
import { useEditorLocale } from "@/lib/editor-locale-context";
import {
    computePublishDiff,
    humaniseFieldName,
    summarisePageChangeCounts,
    type FieldDelta,
    type PageDiff,
    type PublishDiff,
    type SectionChange,
} from "@/lib/publish-diff";
import { getPageLabel } from "./page-tree";

export interface PublishConfirmSheetProps {
    open: boolean;
    blockingChecks: Array<HealthCheck & CheckResult>;
    onClose: () => void;
    onPublishAnyway: () => void;
    onJumpToFix: (fix: NonNullable<CheckResult["fix_action"]>) => void;
    busy?: boolean;
    /** Required for the diff section. */
    config?: StoreConfigV2;
    /**
     * Last-published config, used to compute the diff. `null` (or omitted)
     * triggers the "First publish — everything is new." copy.
     */
    publishedConfig?: StoreConfigV2 | null;
}

export function PublishConfirmSheet({
    open,
    blockingChecks,
    onClose,
    onPublishAnyway,
    onJumpToFix,
    busy,
    config,
    publishedConfig,
}: PublishConfirmSheetProps): React.ReactElement | null {
    const locale = useEditorLocale();
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    const diff = useMemo<PublishDiff | null>(() => {
        if (!config) return null;
        return computePublishDiff(publishedConfig ?? null, config);
    }, [config, publishedConfig]);

    if (!open) return null;

    return (
        <div
            data-testid="publish-confirm-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={t(STRINGS.publish.confirm_title, locale)}
            className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="relative flex h-full w-full max-w-md flex-col overflow-hidden rounded-l-2xl border-l border-(--card-border) bg-(--card-bg) shadow-[0_30px_80px_-20px_rgba(0,0,0,0.5)]"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex shrink-0 items-start justify-between gap-3 border-b border-(--card-border) px-5 py-4">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                        <span
                            aria-hidden="true"
                            className="sb-tile sb-tile--conversion flex h-9 w-9 shrink-0"
                        >
                            <Rocket className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                            <h2 className="text-base font-bold text-foreground">
                                {t(STRINGS.publish.confirm_title, locale)}
                            </h2>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {blockingChecks.length === 0
                                    ? t(STRINGS.publish.confirm_all_clear, locale)
                                    : tFormat(
                                          blockingChecks.length === 1
                                              ? STRINGS.publish.confirm_subtitle_one
                                              : STRINGS.publish.confirm_subtitle_many,
                                          locale,
                                          { n: blockingChecks.length },
                                      )}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t(STRINGS.common.close, locale)}
                        data-testid="publish-confirm-sheet-close"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-black/5 hover:text-foreground"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto p-3">
                    {/* ── Changes-since-last-publish diff ───────────────── */}
                    {diff ? (
                        <PublishDiffSection diff={diff} />
                    ) : null}

                    {/* ── Health warnings ───────────────────────────────── */}
                    <section
                        data-testid="publish-confirm-sheet-list"
                        className={cn(
                            "mt-3",
                            diff && diff.pages.length > 0 && "border-t border-(--card-border) pt-3",
                        )}
                    >
                        {blockingChecks.length === 0 ? (
                            <div
                                data-testid="publish-confirm-sheet-no-warnings"
                                className="rounded-xl border border-dashed border-(--card-border) p-6 text-center text-sm text-foreground/80"
                            >
                                {t(STRINGS.publish.confirm_all_clear, locale)}
                            </div>
                        ) : (
                            <>
                                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-foreground/80">
                                    {t(STRINGS.publish.confirm_title, locale)}
                                </h3>
                                <ul className="flex flex-col gap-2">
                                    {blockingChecks.map((check) => (
                                        <li
                                            key={check.id}
                                            data-testid={`publish-confirm-sheet-item-${check.id}`}
                                            className="flex flex-col gap-2 rounded-xl border border-(--card-border) bg-background p-3"
                                        >
                                            <div className="flex items-start gap-2">
                                                <AlertTriangle
                                                    className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
                                                    aria-hidden="true"
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-sm font-semibold text-foreground/90">
                                                            {check.message ?? check.id}
                                                        </span>
                                                        <span
                                                            className={cn(
                                                                "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                                                                "bg-amber-500/15 text-amber-600",
                                                            )}
                                                        >
                                                            {t(STRINGS.publish.blocks_chip, locale)}
                                                        </span>
                                                    </div>
                                                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                                        {check.category.replace(/_/g, " ")}
                                                    </span>
                                                </div>
                                            </div>
                                            {check.fix_action ? (
                                                <button
                                                    type="button"
                                                    data-testid={`publish-confirm-sheet-fix-${check.id}`}
                                                    onClick={() => onJumpToFix(check.fix_action!)}
                                                    className="self-start inline-flex h-7 items-center rounded-md border border-(--card-border) bg-(--card-bg) px-2.5 text-xs font-semibold text-foreground/80 hover:text-foreground"
                                                >
                                                    {check.fix_action.label}
                                                </button>
                                            ) : null}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </section>
                </div>

                <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-(--card-border) px-4 py-3">
                    <button
                        type="button"
                        onClick={onClose}
                        data-testid="publish-confirm-sheet-cancel"
                        className="inline-flex h-9 items-center rounded-lg border border-(--card-border) bg-(--card-bg) px-3.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-black/5 hover:text-foreground"
                    >
                        {t(STRINGS.publish.cancel, locale)}
                    </button>
                    <button
                        type="button"
                        onClick={onPublishAnyway}
                        disabled={busy}
                        data-testid="publish-confirm-sheet-publish-anyway"
                        className="sb-publish inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                    >
                        <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
                        {busy ? t(STRINGS.publish.publishing, locale) : t(STRINGS.publish.publish_anyway, locale)}
                    </button>
                </footer>
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Diff renderer                                                        */
/* ─────────────────────────────────────────────────────────────────── */

function PublishDiffSection({ diff }: { diff: PublishDiff }): React.ReactElement {
    if (diff.isFirstPublish) {
        return (
            <section
                data-testid="publish-diff"
                data-first-publish="true"
                className="rounded-xl border border-(--card-border) bg-background p-3"
            >
                <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                    Changes since last publish
                </h3>
                <p
                    data-testid="publish-diff-first-publish"
                    className="text-xs text-foreground/80"
                >
                    First publish — everything is new.
                </p>
            </section>
        );
    }

    if (diff.totalChanges === 0 && !diff.brandKitChanged && diff.globalsChanged.length === 0) {
        return (
            <section
                data-testid="publish-diff"
                data-empty="true"
                className="rounded-xl border border-dashed border-(--card-border) p-3"
            >
                <h3 className="mb-1 text-sm font-semibold text-foreground">
                    Changes since last publish
                </h3>
                <p className="text-xs text-muted-foreground">
                    No content changes — config matches what's already live.
                </p>
            </section>
        );
    }

    return (
        <section
            data-testid="publish-diff"
            className="rounded-xl border border-(--card-border) bg-background"
        >
            <header className="border-b border-(--card-border) px-3 py-2">
                <h3 className="text-sm font-semibold text-foreground">
                    Changes since last publish
                </h3>
            </header>
            <div className="flex flex-col">
                {diff.brandKitChanged && (
                    <div
                        data-testid="publish-diff-brand-kit"
                        className="flex items-center gap-2 border-b border-(--card-border) px-3 py-2 text-xs"
                    >
                        <Pencil className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                        <span className="font-semibold text-foreground">Brand kit</span>
                        <span className="text-muted-foreground">— colors / fonts / shape updated</span>
                    </div>
                )}
                {diff.globalsChanged.length > 0 && (
                    <div
                        data-testid="publish-diff-globals"
                        className="flex flex-wrap items-center gap-1.5 border-b border-(--card-border) px-3 py-2 text-xs"
                    >
                        <Pencil className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                        <span className="font-semibold text-foreground">Globals</span>
                        <span className="text-muted-foreground">—</span>
                        {diff.globalsChanged.map((slot) => (
                            <span
                                key={slot}
                                className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                            >
                                {humaniseFieldName(slot)}
                            </span>
                        ))}
                    </div>
                )}
                <ul className="flex flex-col">
                    {diff.pages.map((page) => (
                        <PageGroup key={page.page_id} page={page} />
                    ))}
                </ul>
            </div>
        </section>
    );
}

function PageGroup({ page }: { page: PageDiff }): React.ReactElement {
    const [open, setOpen] = useState<boolean>(true);
    const counts = summarisePageChangeCounts(page);
    return (
        <li className="border-b border-(--card-border) last:border-b-0">
            <button
                type="button"
                data-testid={`publish-diff-page-${page.page_id}`}
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/40"
            >
                {open ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                )}
                <span className="font-semibold text-foreground">{getPageLabel(page.page_id)}</span>
                <span className="text-muted-foreground">
                    — {page.changes.length} change{page.changes.length === 1 ? "" : "s"}
                </span>
                <span className="ml-auto flex items-center gap-1">
                    {counts.added > 0 && (
                        <span
                            data-testid={`publish-diff-page-${page.page_id}-added-count`}
                            className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700"
                        >
                            <Plus className="h-3 w-3" aria-hidden="true" />
                            {counts.added}
                        </span>
                    )}
                    {counts.removed > 0 && (
                        <span
                            data-testid={`publish-diff-page-${page.page_id}-removed-count`}
                            className="inline-flex items-center gap-0.5 rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-700"
                        >
                            <Minus className="h-3 w-3" aria-hidden="true" />
                            {counts.removed}
                        </span>
                    )}
                    {counts.modified > 0 && (
                        <span
                            data-testid={`publish-diff-page-${page.page_id}-modified-count`}
                            className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700"
                        >
                            <Pencil className="h-3 w-3" aria-hidden="true" />
                            {counts.modified}
                        </span>
                    )}
                </span>
            </button>
            {open && (
                <ul className="flex flex-col gap-1 pb-2 pl-7 pr-3">
                    {page.changes.map((change) => (
                        <SectionChangeRow key={change.section_id} change={change} pageId={page.page_id} />
                    ))}
                </ul>
            )}
        </li>
    );
}

function SectionChangeRow({
    change,
    pageId,
}: {
    change: SectionChange;
    pageId: string;
}): React.ReactElement {
    const [open, setOpen] = useState<boolean>(false);
    const hasDeltas = change.kind === "modified" && (change.deltas?.length ?? 0) > 0;

    const Icon =
        change.kind === "added"
            ? Plus
            : change.kind === "removed"
              ? Minus
              : Pencil;
    const iconClass =
        change.kind === "added"
            ? "text-emerald-600"
            : change.kind === "removed"
              ? "text-rose-600"
              : "text-amber-600";

    return (
        <li
            data-testid={`publish-diff-section-${pageId}-${change.section_id}`}
            className="text-xs"
        >
            <button
                type="button"
                onClick={() => hasDeltas && setOpen((v) => !v)}
                disabled={!hasDeltas}
                aria-expanded={hasDeltas ? open : undefined}
                data-testid={`publish-diff-section-toggle-${change.section_id}`}
                className={cn(
                    "flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left",
                    hasDeltas && "hover:bg-muted/40 cursor-pointer",
                )}
            >
                <Icon className={cn("h-3 w-3 shrink-0", iconClass)} aria-hidden="true" />
                <span className="font-semibold text-foreground">{change.label}</span>
                <span className="text-muted-foreground">({change.section_type})</span>
                {hasDeltas && (
                    <span className="ml-auto text-[10px] text-muted-foreground">
                        {open ? "Hide" : `${change.deltas!.length} field${change.deltas!.length === 1 ? "" : "s"}`}
                    </span>
                )}
            </button>
            {hasDeltas && open && (
                <ul
                    data-testid={`publish-diff-section-deltas-${change.section_id}`}
                    className="ml-4 mt-1 flex flex-col gap-0.5 border-l border-(--card-border) pl-2"
                >
                    {change.deltas!.map((delta, i) => (
                        <li key={i} className="text-[11px]">
                            <FieldDeltaRow delta={delta} />
                        </li>
                    ))}
                </ul>
            )}
        </li>
    );
}

function FieldDeltaRow({ delta }: { delta: FieldDelta }): React.ReactElement {
    const label =
        delta.kind === "i18n" && delta.locale
            ? `${humaniseFieldName(delta.field)} (${delta.locale})`
            : humaniseFieldName(delta.field);

    return (
        <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-foreground/80">{label}</span>
            {delta.kind === "complex" ? (
                <span className="text-muted-foreground">changed</span>
            ) : (
                <span className="font-mono text-[10px] text-muted-foreground">
                    <span className="line-through text-rose-700/80">{stringifyPreview(delta.before)}</span>
                    <span className="mx-1">→</span>
                    <span className="text-emerald-700/90">{stringifyPreview(delta.after)}</span>
                </span>
            )}
        </div>
    );
}

function stringifyPreview(v: unknown): string {
    if (v === undefined) return "(unset)";
    if (v === null) return "null";
    if (typeof v === "string") {
        return v.length > 60 ? `"${v.slice(0, 57)}…"` : `"${v}"`;
    }
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    try {
        const s = JSON.stringify(v);
        return s.length > 60 ? `${s.slice(0, 57)}…` : s;
    } catch {
        return "(complex)";
    }
}

export type { PageId };
