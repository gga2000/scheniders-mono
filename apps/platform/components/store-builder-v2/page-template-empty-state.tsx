"use client";

// =====================================================================
// PageTemplateEmptyState — Schneiders Builder v2
// =====================================================================
// Replaces the dry "No blocks yet. Click + Add block" empty state in the
// Inspector "Blocks" tab with a bento-styled grid of the five curated
// page templates. The merchant can either:
//   - click a template card → confirm dialog → applyTemplate, or
//   - click "Or start blank ↓" → dismiss this view and reveal the
//     existing flat empty state (the host owns dismissal — we just
//     fire `onStartBlank`).
//
// This component renders inside `section-list-panel.tsx` only when
// `sections.length === 0` AND the merchant hasn't dismissed it.
//
// We intentionally inline a chunky-bento look-and-feel here instead of
// importing `BentoCard` from `packages/sections/src/helpers/primitives`
// because that primitive pulls in framer-motion + storefront helpers
// that have no place inside the editor bundle. The visual is matched
// against the storefront bento style (offset shadow, brand border).
// =====================================================================

import { useCallback, useMemo, useState, type ReactElement } from "react";
import { Check, LayoutTemplate, X } from "lucide-react";
import type { SectionInstance } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import {
    PAGE_TEMPLATES,
    applyTemplate,
    type PageTemplate,
} from "@/lib/page-templates";
import { STRINGS, t as tx, tFormat } from "@/lib/editor-i18n";
import { useResolvedEditorLocale } from "@/lib/editor-locale-context";
import type { LocaleCode } from "@scheniders/shared";

export interface PageTemplateEmptyStateProps {
    /** Current number of sections on the active page. Drives the defensive
     *  "this will replace N sections" warning — should be 0 in practice. */
    currentSectionCount: number;
    /** Called with rehashed template sections when the merchant confirms. */
    onApply: (sections: SectionInstance[]) => void;
    /** Called when the merchant clicks "Or start blank ↓" — host should
     *  dismiss this view to reveal the flat empty state / add button. */
    onStartBlank: () => void;
    /** Editor locale; falls through `useResolvedEditorLocale` defaults. */
    activeLocale?: LocaleCode;
    /** Test-only — override the template list. */
    templatesOverride?: PageTemplate[];
}

export function PageTemplateEmptyState(
    props: PageTemplateEmptyStateProps,
): ReactElement {
    const {
        currentSectionCount,
        onApply,
        onStartBlank,
        activeLocale,
        templatesOverride,
    } = props;

    const locale = useResolvedEditorLocale(activeLocale);
    const templates = templatesOverride ?? PAGE_TEMPLATES;
    const [pendingId, setPendingId] = useState<string | null>(null);

    const pending = useMemo<PageTemplate | null>(() => {
        if (!pendingId) return null;
        return templates.find((t) => t.id === pendingId) ?? null;
    }, [templates, pendingId]);

    const handleConfirm = useCallback((): void => {
        if (!pending) return;
        onApply(applyTemplate(pending));
        setPendingId(null);
    }, [pending, onApply]);

    return (
        <div
            data-testid="page-template-empty-state"
            className="flex flex-col gap-3"
        >
            <header className="flex items-start gap-2 px-1">
                <LayoutTemplate
                    className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                    aria-hidden="true"
                />
                <div className="min-w-0">
                    <h3 className="text-sm font-semibold tracking-tight">
                        {tx(STRINGS.page_template.title, locale)}
                    </h3>
                    <p className="mt-0.5 text-xs text-foreground/80">
                        {tx(STRINGS.page_template.subtitle, locale)}
                    </p>
                </div>
            </header>

            <ul
                data-testid="page-template-empty-state-list"
                className="grid grid-cols-1 gap-2.5"
            >
                {templates.map((tpl) => (
                    <li key={tpl.id}>
                        <BentoTemplateCard
                            template={tpl}
                            onPick={() => setPendingId(tpl.id)}
                        />
                    </li>
                ))}
            </ul>

            <button
                type="button"
                data-testid="page-template-empty-state-start-blank"
                onClick={onStartBlank}
                className="mt-1 inline-flex items-center justify-center self-center gap-1 rounded-md px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
                {tx(STRINGS.page_template.start_blank, locale)}
            </button>

            {pending ? (
                <ConfirmOverlay
                    template={pending}
                    currentSectionCount={currentSectionCount}
                    onCancel={() => setPendingId(null)}
                    onConfirm={handleConfirm}
                    locale={locale}
                />
            ) : null}
        </div>
    );
}

interface BentoTemplateCardProps {
    template: PageTemplate;
    onPick: () => void;
}

function BentoTemplateCard(p: BentoTemplateCardProps): ReactElement {
    const { template } = p;
    return (
        <button
            type="button"
            data-testid={`page-template-empty-state-card-${template.id}`}
            onClick={p.onPick}
            className={cn(
                "group relative flex w-full flex-col gap-2 overflow-hidden rounded-xl border-2 border-(--card-border) bg-(--card-bg) p-3 text-left transition-all",
                "hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[4px_4px_0_0_rgba(0,0,0,0.08)]",
                "active:translate-y-0 active:shadow-none",
            )}
        >
            <BentoThumbnail template={template} />
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                        {template.name_i18n.en ?? template.id}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-foreground/80">
                        {template.description_i18n.en}
                    </p>
                </div>
                <span
                    aria-hidden="true"
                    data-testid={`page-template-empty-state-card-${template.id}-cta`}
                    className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-foreground px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-background transition-transform group-hover:translate-x-0.5"
                >
                    Use this →
                </span>
            </div>
        </button>
    );
}

function BentoThumbnail({ template }: { template: PageTemplate }): ReactElement {
    // No template thumbnails ship today — synthesize a chunky placeholder
    // visual that hints at section density without per-template artwork.
    const bars = Array.from({ length: Math.min(template.sections.length, 5) }, (_, i) => i);
    return (
        <div
            data-testid={`page-template-empty-state-card-${template.id}-thumb`}
            className="relative flex aspect-[16/9] w-full items-end justify-start overflow-hidden rounded-lg bg-gradient-to-br from-primary/15 via-primary/5 to-muted/40 px-3 py-2.5"
        >
            <div className="flex w-full flex-col gap-1.5">
                {bars.map((i) => (
                    <div
                        key={i}
                        className={cn(
                            "h-1.5 rounded-full bg-primary/50",
                            i === 0 && "w-3/4",
                            i === 1 && "w-full",
                            i === 2 && "w-2/3",
                            i === 3 && "w-5/6",
                            i === 4 && "w-1/2",
                        )}
                    />
                ))}
            </div>
            <span className="absolute right-2 top-2 inline-flex h-5 items-center rounded-full bg-background/80 px-1.5 text-[10px] font-semibold uppercase tracking-wide tabular-nums text-foreground/80 backdrop-blur">
                {template.sections.length}
            </span>
        </div>
    );
}

interface ConfirmOverlayProps {
    template: PageTemplate;
    currentSectionCount: number;
    onCancel: () => void;
    onConfirm: () => void;
    locale: LocaleCode;
}

function ConfirmOverlay(p: ConfirmOverlayProps): ReactElement {
    return (
        <div
            role="dialog"
            aria-modal="true"
            data-testid="page-template-empty-state-confirm"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
            <button
                type="button"
                aria-hidden="true"
                tabIndex={-1}
                onClick={p.onCancel}
                data-testid="page-template-empty-state-confirm-backdrop"
                className="absolute inset-0 cursor-default"
            />
            <div
                className="relative z-10 flex w-full max-w-md flex-col gap-3 rounded-lg border border-(--card-border) bg-(--card-bg) p-4 shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-semibold">
                        {tFormat(STRINGS.page_template.apply_title, p.locale, {
                            name: p.template.name_i18n.en ?? p.template.id,
                        })}
                    </h4>
                    <button
                        type="button"
                        onClick={p.onCancel}
                        aria-label={tx(STRINGS.page_template.close, p.locale)}
                        data-testid="page-template-empty-state-confirm-close"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
                <p className="text-xs text-foreground/80">
                    {p.template.description_i18n.en}
                </p>
                {p.currentSectionCount > 0 && (
                    <div
                        data-testid="page-template-empty-state-confirm-warning"
                        className="rounded-md border border-yellow-400/40 bg-yellow-50 px-3 py-2 text-xs text-yellow-900"
                    >
                        {p.currentSectionCount === 1
                            ? tx(STRINGS.page_template.warning_replace_one, p.locale)
                            : tFormat(
                                  STRINGS.page_template.warning_replace_many,
                                  p.locale,
                                  { n: p.currentSectionCount },
                              )}
                    </div>
                )}
                <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/70">
                    {p.template.sections.length === 1
                        ? tx(STRINGS.page_template.includes_count_one, p.locale)
                        : tFormat(STRINGS.page_template.includes_count_many, p.locale, {
                              n: p.template.sections.length,
                          })}
                </p>
                <div className="flex items-center justify-end gap-2">
                    <button
                        type="button"
                        data-testid="page-template-empty-state-confirm-cancel"
                        onClick={p.onCancel}
                        className="inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    >
                        {tx(STRINGS.page_template.cancel, p.locale)}
                    </button>
                    <button
                        type="button"
                        data-testid="page-template-empty-state-confirm-apply"
                        onClick={p.onConfirm}
                        className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                    >
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        {tx(STRINGS.page_template.apply, p.locale)}
                    </button>
                </div>
            </div>
        </div>
    );
}
