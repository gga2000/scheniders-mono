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
import { ChevronLeft } from "lucide-react";
import type {
    LocaleCode,
    PageId,
    StoreConfigV2,
} from "@scheniders/shared";
import { SUPPORTED_LOCALES } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { computeCompleteness } from "@/lib/i18n-completeness";
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

const LOCALE_LABEL: Record<LocaleCode, string> = {
    ar: "Arabic",
    en: "English",
    ku: "Kurdish",
};

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
    const result = useMemo(() => computeCompleteness(config), [config]);
    const enabled = (config.enabled_locales ?? SUPPORTED_LOCALES) as LocaleCode[];
    const [focusLocale, setFocusLocale] = useState<LocaleCode>(
        enabled.find((l) => l !== "en") ?? enabled[0] ?? "en",
    );

    return (
        <div
            data-testid="i18n-screen"
            className="flex flex-1 flex-col overflow-hidden bg-background"
        >
            {/* Header */}
            <header className="flex h-12 items-center justify-between border-b border-(--card-border) bg-(--card-bg) px-4">
                <div className="flex items-center gap-2">
                    {onClose && (
                        <button
                            type="button"
                            data-testid="i18n-screen-back"
                            onClick={onClose}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                            aria-label="Back to preview"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                    )}
                    <h2 className="text-sm font-semibold tracking-tight">
                        Translation coverage
                    </h2>
                </div>
                <div className="flex items-center gap-3">
                    {enabled.map((loc) => {
                        const c = result.perLocale[loc];
                        return (
                            <button
                                key={loc}
                                type="button"
                                onClick={() => setFocusLocale(loc)}
                                data-testid={`i18n-summary-pill-${loc}`}
                                className={cn(
                                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
                                    focusLocale === loc
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted/40 text-muted-foreground hover:bg-muted/70",
                                )}
                            >
                                <span>{LOCALE_LABEL[loc]}</span>
                                <span className="tabular-nums">{c.pct}%</span>
                            </button>
                        );
                    })}
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-6">
                <div className="mx-auto max-w-3xl space-y-6">
                    <p className="text-sm text-foreground/80">
                        Showing untranslated fields for{" "}
                        <span className="font-semibold text-foreground">
                            {LOCALE_LABEL[focusLocale]}
                        </span>
                        . Switch locales using the pills above.
                    </p>

                    {result.perPage.map((page) => {
                        const labelPage =
                            page.page_id === ("_globals" as PageId)
                                ? "Globals"
                                : getPageLabel(page.page_id as PageId);
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
                                className="rounded-lg border border-(--card-border) bg-(--card-bg) p-4"
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
                                                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/30"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <div className="truncate font-medium">
                                                        {m.section_label}
                                                    </div>
                                                    <div className="truncate text-[10px] text-muted-foreground">
                                                        {m.path}
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
                                                        className="shrink-0 rounded-md bg-muted/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide hover:bg-muted"
                                                    >
                                                        Translate
                                                    </button>
                                                ) : null}
                                            </li>
                                        ))}
                                        {missing.length > 8 && (
                                            <li className="px-2 text-[10px] text-muted-foreground">
                                                + {missing.length - 8} more…
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
    const result = useMemo(() => computeCompleteness(config), [config]);
    const enabled = (config.enabled_locales ?? SUPPORTED_LOCALES) as LocaleCode[];
    return (
        <button
            type="button"
            data-testid="i18n-toolbar-pill"
            onClick={onClick}
            title="View translation coverage"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-(--card-border) bg-(--card-bg) px-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
            <span aria-hidden="true">🌐</span>
            {enabled.map((loc, i) => {
                const c = result.perLocale[loc];
                return (
                    <span key={loc} className="tabular-nums">
                        {i > 0 && <span className="mx-1 text-muted-foreground/50">/</span>}
                        {loc} {c.pct}%
                    </span>
                );
            })}
        </button>
    );
}
