"use client";

// =====================================================================
// PageTemplatePicker — Schneiders Builder v2
// =====================================================================
// Modal overlay launched from the "+ Start from a template" button in
// the page tree / empty page state. Lists 5 curated starter packs and
// applies the chosen one to the active page on confirm.
//
// Behaviour:
//   - Clicking a card → confirm dialog (warns when current page is not
//     empty: "this will replace N sections").
//   - Confirming replaces `sections` with `applyTemplate(template)` —
//     placeholder ids get rehashed so reapplying is safe.
//   - Discarded sections are gone; the merchant should know.
// =====================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { Check, Layout, LayoutTemplate, X } from "lucide-react";
import type { SectionInstance } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import {
    PAGE_TEMPLATES,
    applyTemplate,
    type PageTemplate,
} from "@/lib/page-templates";
import { STRINGS, t as tx, tFormat } from "@/lib/editor-i18n";
import { useEditorLocale } from "@/lib/editor-locale-context";

export interface PageTemplatePickerProps {
    open: boolean;
    onClose: () => void;
    /** Current section count — drives the "replace N sections" warning. */
    currentSectionCount: number;
    /** Fired with the rehashed template sections when the merchant confirms. */
    onApply: (sections: SectionInstance[]) => void;
    /** Test-only — override the template list. */
    templatesOverride?: PageTemplate[];
}

export function PageTemplatePicker(
    props: PageTemplatePickerProps,
): ReactElement | null {
    const {
        open,
        onClose,
        currentSectionCount,
        onApply,
        templatesOverride,
    } = props;

    const locale = useEditorLocale();
    const templates = templatesOverride ?? PAGE_TEMPLATES;
    const [pendingId, setPendingId] = useState<string | null>(null);

    useEffect(() => {
        if (open) setPendingId(null);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape") {
                if (pendingId) setPendingId(null);
                else onClose();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose, pendingId]);

    const pending = useMemo<PageTemplate | null>(() => {
        if (!pendingId) return null;
        return templates.find((t) => t.id === pendingId) ?? null;
    }, [templates, pendingId]);

    const handleConfirm = useCallback((): void => {
        if (!pending) return;
        onApply(applyTemplate(pending));
        setPendingId(null);
        onClose();
    }, [pending, onApply, onClose]);

    if (!open) return null;

    return (
        <div
            data-testid="page-template-picker"
            role="dialog"
            aria-modal="true"
            aria-label={tx(STRINGS.page_template.title, locale)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
        >
            <button
                type="button"
                aria-hidden="true"
                tabIndex={-1}
                onClick={() => {
                    if (pending) setPendingId(null);
                    else onClose();
                }}
                data-testid="page-template-picker-backdrop"
                className="absolute inset-0 cursor-default"
            />
            <div
                className="relative z-10 flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-(--card-border) bg-(--card-bg) shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)]"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-start justify-between gap-3 border-b border-(--card-border) px-5 py-4">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span
                            aria-hidden="true"
                            className="sb-tile sb-tile--content flex h-9 w-9 shrink-0"
                        >
                            <LayoutTemplate className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                            <h2 className="text-base font-semibold tracking-tight">
                                {tx(STRINGS.page_template.title, locale)}
                            </h2>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {tx(STRINGS.page_template.subtitle, locale)}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={tx(STRINGS.page_template.close, locale)}
                        data-testid="page-template-picker-close"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </header>

                {pending ? (
                    <div
                        data-testid="page-template-picker-confirm"
                        className="flex flex-1 flex-col gap-3 overflow-y-auto p-5"
                    >
                        <h3 className="text-base font-semibold">
                            {tFormat(STRINGS.page_template.apply_title, locale, { name: pending.name_i18n.en ?? pending.id })}
                        </h3>
                        <p className="text-sm text-foreground/80">
                            {pending.description_i18n.en}
                        </p>
                        {currentSectionCount > 0 && (
                            <div
                                data-testid="page-template-picker-warning"
                                className="rounded-xl border border-yellow-400/40 bg-yellow-50 px-3 py-2 text-xs text-yellow-900 dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-200"
                            >
                                {currentSectionCount === 1
                                    ? tx(STRINGS.page_template.warning_replace_one, locale)
                                    : tFormat(STRINGS.page_template.warning_replace_many, locale, { n: currentSectionCount })}
                            </div>
                        )}
                        <div className="rounded-xl border border-(--card-border) bg-background p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/80">
                                {pending.sections.length === 1
                                    ? tx(STRINGS.page_template.includes_count_one, locale)
                                    : tFormat(STRINGS.page_template.includes_count_many, locale, { n: pending.sections.length })}
                            </p>
                            <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                                {pending.sections.map((s, i) => (
                                    <li
                                        key={`${s.type}-${i}`}
                                        className="flex items-center gap-2 text-xs text-foreground/80"
                                    >
                                        <Layout
                                            className="h-3.5 w-3.5 text-muted-foreground"
                                            aria-hidden="true"
                                        />
                                        <span>{s.type}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <footer className="mt-2 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                data-testid="page-template-picker-cancel"
                                onClick={() => setPendingId(null)}
                                className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                            >
                                {tx(STRINGS.page_template.cancel, locale)}
                            </button>
                            <button
                                type="button"
                                data-testid="page-template-picker-apply"
                                onClick={handleConfirm}
                                className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-(--card-shadow) transition-all duration-150 hover:-translate-y-px hover:shadow-(--card-shadow-hover)"
                            >
                                <Check
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                />
                                {tx(STRINGS.page_template.apply, locale)}
                            </button>
                        </footer>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto p-4">
                        <ul
                            data-testid="page-template-picker-list"
                            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                        >
                            {templates.map((t) => (
                                <li key={t.id}>
                                    <button
                                        type="button"
                                        data-testid={`page-template-picker-card-${t.id}`}
                                        onClick={() => setPendingId(t.id)}
                                        className="sb-row flex w-full flex-col gap-2 rounded-xl border border-(--card-border) bg-(--card-bg) p-3 text-left shadow-(--card-shadow)"
                                    >
                                        <TemplateThumbnail count={t.sections.length} />
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="truncate text-sm font-semibold">
                                                {t.name_i18n.en ?? t.id}
                                            </span>
                                            <span
                                                className="inline-flex h-5 items-center rounded-full bg-muted/60 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground tabular-nums"
                                                data-testid={`page-template-picker-card-${t.id}-count`}
                                            >
                                                {t.sections.length}
                                            </span>
                                        </div>
                                        <p className="line-clamp-2 text-xs text-foreground/80">
                                            {t.description_i18n.en}
                                        </p>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}

function TemplateThumbnail({ count }: { count: number }): ReactElement {
    // Cheap placeholder visual — N stacked bars hinting at the section
    // arrangement without us shipping a thumbnail per template.
    const bars = Array.from({ length: Math.min(count, 5) }, (_, i) => i);
    return (
        <div className="flex aspect-[16/9] w-full flex-col justify-center gap-1.5 rounded bg-gradient-to-br from-primary/10 to-muted/30 px-3 py-2">
            {bars.map((i) => (
                <div
                    key={i}
                    className={cn(
                        "h-1.5 rounded-full bg-primary/40",
                        i === 0 && "w-3/4",
                        i === 1 && "w-full",
                        i === 2 && "w-2/3",
                        i === 3 && "w-5/6",
                        i === 4 && "w-1/2",
                    )}
                />
            ))}
        </div>
    );
}
