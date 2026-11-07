"use client";

// =====================================================================
// i18n completeness screen
// =====================================================================
// Page tree with per-page % bars per locale, and a "go to untranslated
// fields" list (jump to that page and open the section edit panel).
// Pure presentation — counts come from
// `apps/platform/lib/i18n-completeness.ts`.
// =====================================================================

import { useMemo, useState } from "react";
import { ChevronLeft, Languages } from "lucide-react";
import type {
    LocaleCode,
    PageId,
    StoreConfigV2,
} from "@scheniders/shared";
import { SUPPORTED_LOCALES } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { computeCompleteness } from "@/lib/i18n-completeness";
import { STRINGS, t, tFormat } from "@/lib/editor-i18n";
import { useEditorLocale } from "@/lib/editor-locale-context";
import { resolveFieldLabel } from "@/lib/section-field-meta";
import { getPageLabel } from "./page-tree";

/* ─────────────────────────────────────────────────────────────────── */
/* Props                                                                */
/* ─────────────────────────────────────────────────────────────────── */

export interface I18nScreenProps {
    config: StoreConfigV2;
    /** Navigate to a page and close the screen. */
    onSelectPage: (page_id: PageId) => void;
    /** Open a section's edit panel and jump there. */
    onSelectSection?: (page_id: PageId, section_id: string) => void;
    onClose?: () => void;
}

/**
 * "items.0.title_i18n" → the field's merchant label ("العنوان"): the last
 * named segment of the path, never the raw developer path.
 */
function fieldLabelFromPath(path: string, locale: LocaleCode): string {
    const key = [...path.split(".")].reverse().find((seg) => seg && !/^\d+$/.test(seg)) ?? path;
    return resolveFieldLabel(undefined, key, locale);
}

function pctColor(pct: number): string {
    if (pct < 40) return "bg-red-500";
    if (pct < 70) return "bg-amber-500";
    if (pct < 95) return "bg-emerald-400";
    return "bg-emerald-600";
}

/* ─────────────────────────────────────────────────────────────────── */
/* Component                                                            */
/* ─────────────────────────────────────────────────────────────────── */

export function I18nScreen({
    config,
    onSelectPage,
    onSelectSection,
    onClose,
}: I18nScreenProps) {
    const locale = useEditorLocale();
    const result = useMemo(() => computeCompleteness(config), [config]);
    const enabled = (config.enabled_locales ?? SUPPORTED_LOCALES) as LocaleCode[];
    const [focusLocale, setFocusLocale] = useState<LocaleCode>(
        // Open on the first language that still needs work — never on the
        // store's main language, which is the source, not a translation.
        enabled.find((l) => l !== config.default_locale) ?? enabled[0] ?? "en",
    );

    return (
        <div
            data-testid="i18n-screen"
            className="flex flex-1 flex-col overflow-hidden bg-background"
        >
            {/* Header */}
            <header className="flex h-14 items-center justify-between border-b border-(--card-border) bg-(--card-bg) px-5">
                <div className="flex items-center gap-2.5">
                    {onClose && (
                        <button
                            type="button"
                            data-testid="i18n-screen-back"
                            onClick={onClose}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                            aria-label={t(STRINGS.i18n_screen.back, locale)}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                    )}
                    <span
                        aria-hidden="true"
                        className="sb-tile sb-tile--hero flex h-8 w-8 shrink-0"
                    >
                        <Languages className="h-4 w-4" />
                    </span>
                    <h2 className="text-base font-semibold tracking-tight">
                        {t(STRINGS.i18n_screen.title, locale)}
                    </h2>
                </div>
                <div className="flex items-center gap-2">
                    {enabled.map((loc) => {
                        const c = result.perLocale[loc];
                        return (
                            <button
                                key={loc}
                                type="button"
                                onClick={() => setFocusLocale(loc)}
                                data-testid={`i18n-summary-pill-${loc}`}
                                className={cn(
                                    "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150",
                                    focusLocale === loc
                                        ? "bg-primary text-primary-foreground shadow-(--card-shadow)"
                                        : "border border-(--card-border) bg-(--background-soft) text-muted-foreground hover:border-(--border-hover) hover:text-foreground",
                                )}
                            >
                                <span>{t(STRINGS.languages[loc], locale)}</span>
                                <span className="tabular-nums">{c.pct}%</span>
                            </button>
                        );
                    })}
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-6">
                <div className="mx-auto max-w-3xl space-y-6">
                    <p className="text-sm text-foreground/80">
                        {tFormat(STRINGS.i18n_screen.showing, locale, {
                            lang: t(STRINGS.languages[focusLocale], locale),
                        })}
                    </p>

                    {result.perPage.map((page) => {
                        const labelPage =
                            page.page_id === ("_globals" as PageId)
                                ? t(STRINGS.i18n_screen.globals, locale)
                                : getPageLabel(page.page_id as PageId, locale);
                        const c = page.perLocale[focusLocale];
                        if (c.total === 0) return null;
                        const missing = page.sections.flatMap((s) =>
                            s.missing[focusLocale].map((path) => ({
                                section_id: s.section_id,
                                section_label: s.label ?? s.type,
                                path,
                            })),
                        );
                        return (
                            <div
                                key={`${page.page_id}-${labelPage}`}
                                data-testid={`i18n-page-${page.page_id}`}
                                className="rounded-xl border border-(--card-border) bg-(--card-bg) p-4 shadow-(--card-shadow)"
                            >
                                <div className="mb-3 flex items-center justify-between gap-3">
                                    <button
                                        type="button"
                                        data-testid={`i18n-jump-page-${page.page_id}`}
                                        onClick={() =>
                                            page.page_id !== ("_globals" as PageId) &&
                                            onSelectPage(page.page_id as PageId)
                                        }
                                        className="text-left text-sm font-semibold hover:underline disabled:cursor-default disabled:no-underline"
                                        disabled={page.page_id === ("_globals" as PageId)}
                                    >
                                        {labelPage}
                                    </button>
                                    <div className="flex items-center gap-2">
                                        <div className="h-2 w-32 overflow-hidden rounded-full bg-muted/40">
                                            <div
                                                className={cn(
                                                    "h-full transition-all",
                                                    pctColor(c.pct),
                                                )}
                                                style={{ width: `${c.pct}%` }}
                                            />
                                        </div>
                                        <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                                            {c.filled}/{c.total}
                                        </span>
                                    </div>
                                </div>

                                {missing.length > 0 && (
                                    <ul className="space-y-1">
                                        {missing.slice(0, 8).map((m, i) => (
                                            <li
                                                key={`${m.section_id}-${m.path}-${i}`}
                                                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-black/5"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <div className="truncate font-medium">
                                                        {m.section_label}
                                                    </div>
                                                    <div className="truncate text-[10px] text-muted-foreground">
                                                        {fieldLabelFromPath(m.path, locale)}
                                                    </div>
                                                </div>
                                                {onSelectSection &&
                                                page.page_id !== ("_globals" as PageId) ? (
                                                    <button
                                                        type="button"
                                                        data-testid="i18n-jump-section"
                                                        onClick={() =>
                                                            onSelectSection(
                                                                page.page_id as PageId,
                                                                m.section_id,
                                                            )
                                                        }
                                                        className="shrink-0 rounded-lg bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary transition-colors hover:bg-primary/15"
                                                    >
                                                        {t(STRINGS.i18n_screen.translate, locale)}
                                                    </button>
                                                ) : null}
                                            </li>
                                        ))}
                                        {missing.length > 8 && (
                                            <li className="px-2 text-[10px] text-muted-foreground">
                                                {tFormat(STRINGS.i18n_screen.more, locale, {
                                                    n: missing.length - 8,
                                                })}
                                            </li>
                                        )}
                                    </ul>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Toolbar pill — read-only "ar 73% / en 100%" badge                    */
/* ─────────────────────────────────────────────────────────────────── */

export interface I18nToolbarPillProps {
    config: StoreConfigV2;
    onClick: () => void;
}

export function I18nToolbarPill({ config, onClick }: I18nToolbarPillProps) {
    const locale = useEditorLocale();
    const result = useMemo(() => computeCompleteness(config), [config]);
    const enabled = (config.enabled_locales ?? SUPPORTED_LOCALES) as LocaleCode[];
    // One number a merchant can read: how complete the LEAST-finished
    // extra language is. A one-language store has nothing to translate.
    const others = enabled.filter((l) => l !== config.default_locale);
    if (others.length === 0) return null;
    const pct = Math.min(...others.map((l) => result.perLocale[l].pct));
    return (
        <button
            type="button"
            data-testid="i18n-toolbar-pill"
            onClick={onClick}
            title={t(STRINGS.i18n_screen.pill_title, locale)}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-(--card-border) bg-(--background-soft) px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-(--border-hover) hover:text-foreground"
        >
            <Languages aria-hidden="true" className="h-3.5 w-3.5" />
            <span dir="auto" className="tabular-nums">
                {tFormat(STRINGS.i18n_screen.pill, locale, { pct })}
            </span>
        </button>
    );
}
