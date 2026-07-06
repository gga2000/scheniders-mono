"use client";

// =====================================================================
// I18nStringInput — locale-aware text input for `I18nString`
// =====================================================================
// One language at a time (UX-05 / UX-13 tuck-away):
//   - The editor's active locale renders as THE input — full width, no
//     locale tabs competing with the label.
//   - Every other locale lives behind a single quiet reveal —
//     "الترجمات (EN ✓ · KU –) ＋" — which shows per-locale fill state
//     at a glance and expands compact secondary rows on demand.
//   - Secondary rows are ALWAYS collapsed by default (even when they
//     hold content — the fill chips carry that signal), and offer a
//     one-tap "copy from <active>" when empty.
//   - English is the canonical fallback: if a non-EN active locale is
//     empty while EN has content, a localized hint shows what visitors
//     currently see.
// =====================================================================

import { useMemo, useState, type ReactElement } from "react";
import { Plus } from "lucide-react";
import type { I18nString, LocaleCode } from "@scheniders/shared";
import { SUPPORTED_LOCALES, LOCALE_LABELS } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { STRINGS, t, tFormat } from "@/lib/editor-i18n";

const LOCALE_SHORT: Record<LocaleCode, string> = {
    en: "EN",
    ar: "AR",
    ku: "KU",
};

export interface I18nStringInputProps {
    label: string;
    value: I18nString;
    onChange: (next: I18nString) => void;
    placeholder?: string;
    multiline?: boolean;
    helperText?: string;
    /** Optional fixed test id prefix — useful for query selectors in tests. */
    testIdPrefix?: string;
    /**
     * Locale currently selected in the editor toolbar — the single
     * language this field edits until the translations reveal is opened.
     */
    activeLocale?: LocaleCode;
}

export function I18nStringInput({
    label,
    value,
    onChange,
    placeholder,
    multiline = false,
    helperText,
    testIdPrefix = "i18n-input",
    activeLocale = "en",
}: I18nStringInputProps): ReactElement {
    // Per-field reveal for the non-active locales. Always collapsed by
    // default — content presence is communicated by the fill chips, not
    // by permanently expanded inputs.
    const [translationsOpen, setTranslationsOpen] = useState<boolean>(false);

    const updateLocale = (loc: LocaleCode, next: string): void => {
        const nextMap: I18nString = { ...(value ?? {}) };
        if (next === "") {
            delete nextMap[loc];
        } else {
            nextMap[loc] = next;
        }
        onChange(nextMap);
    };

    const enValue = value?.en ?? "";
    const activeValue = value?.[activeLocale] ?? "";
    const showFallback = activeLocale !== "en" && !activeValue && !!enValue;

    const secondaryLocales = useMemo(
        () => SUPPORTED_LOCALES.filter((l) => l !== activeLocale),
        [activeLocale],
    );

    // "EN ✓ · KU –" — at-a-glance fill state for the collapsed reveal.
    const fillState = secondaryLocales
        .map((loc) => `${LOCALE_SHORT[loc]} ${value?.[loc] ? "✓" : "–"}`)
        .join(" · ");

    return (
        <div
            className="space-y-1.5"
            data-testid={`${testIdPrefix}-root`}
            data-active-locale={activeLocale}
        >
            {label ? (
                <label className="text-sm font-medium">{label}</label>
            ) : null}

            {/* Active-locale field — THE input. */}
            <div data-testid={`${testIdPrefix}-active`} data-locale={activeLocale}>
                {multiline ? (
                    <textarea
                        data-testid={`${testIdPrefix}-textarea`}
                        value={activeValue}
                        onChange={(e) => updateLocale(activeLocale, e.target.value)}
                        placeholder={placeholder}
                        rows={3}
                        dir="auto"
                        className={cn(
                            "w-full rounded-xl border border-(--card-border) bg-background px-3.5 py-2.5 text-sm",
                            "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                            "transition-colors resize-y min-h-[88px]",
                        )}
                    />
                ) : (
                    <input
                        type="text"
                        data-testid={`${testIdPrefix}-input`}
                        value={activeValue}
                        onChange={(e) => updateLocale(activeLocale, e.target.value)}
                        placeholder={placeholder}
                        dir="auto"
                        className={cn(
                            "w-full rounded-xl border border-(--card-border) bg-background px-3.5 py-2.5 text-sm",
                            "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                            "transition-colors",
                        )}
                    />
                )}

                {showFallback && (
                    <div
                        data-testid={`${testIdPrefix}-fallback`}
                        className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"
                    >
                        <span aria-hidden="true">↓</span>
                        <span>{t(STRINGS.i18n_input.fallback_prefix, activeLocale)} </span>
                        <span className="italic">&ldquo;{enValue}&rdquo;</span>
                    </div>
                )}

                {helperText && !showFallback && (
                    <p className="mt-1 text-[11px] text-muted-foreground">{helperText}</p>
                )}
            </div>

            {/* Translations tuck-away. */}
            {!translationsOpen ? (
                <button
                    type="button"
                    data-testid={`${testIdPrefix}-translations-toggle`}
                    onClick={() => setTranslationsOpen(true)}
                    className="inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                >
                    {tFormat(STRINGS.i18n_input.translations_toggle, activeLocale, {
                        state: fillState,
                    })}
                    <Plus className="h-3 w-3" aria-hidden="true" />
                </button>
            ) : (
                <div
                    className="flex flex-col gap-1.5"
                    data-testid={`${testIdPrefix}-secondary`}
                >
                    {secondaryLocales.map((loc) => {
                        const localeValue = value?.[loc] ?? "";
                        return (
                            <div
                                key={loc}
                                data-testid={`${testIdPrefix}-secondary-${loc}`}
                                className="flex items-center gap-2"
                            >
                                <span
                                    className="inline-flex h-6 w-9 shrink-0 items-center justify-center rounded-md bg-muted/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                                    title={LOCALE_LABELS[loc]}
                                    aria-hidden="true"
                                >
                                    {LOCALE_SHORT[loc]}
                                </span>
                                {multiline ? (
                                    <textarea
                                        data-testid={`${testIdPrefix}-textarea-${loc}`}
                                        value={localeValue}
                                        onChange={(e) => updateLocale(loc, e.target.value)}
                                        placeholder={placeholder}
                                        rows={2}
                                        dir="auto"
                                        className={cn(
                                            "flex-1 rounded-lg border border-(--card-border) bg-background px-2.5 py-1.5 text-xs",
                                            "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                                            "transition-colors resize-y",
                                        )}
                                    />
                                ) : (
                                    <input
                                        type="text"
                                        data-testid={`${testIdPrefix}-input-${loc}`}
                                        value={localeValue}
                                        onChange={(e) => updateLocale(loc, e.target.value)}
                                        placeholder={placeholder}
                                        dir="auto"
                                        className={cn(
                                            "flex-1 rounded-lg border border-(--card-border) bg-background px-2.5 py-1.5 text-xs",
                                            "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                                            "transition-colors",
                                        )}
                                    />
                                )}
                                {!localeValue && activeValue ? (
                                    <button
                                        type="button"
                                        data-testid={`${testIdPrefix}-copy-${loc}`}
                                        title={tFormat(
                                            STRINGS.i18n_input.copy_from_active,
                                            activeLocale,
                                            { locale: LOCALE_SHORT[activeLocale] },
                                        )}
                                        onClick={() => updateLocale(loc, activeValue)}
                                        className="inline-flex h-6 shrink-0 items-center rounded-md bg-muted/40 px-1.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
                                    >
                                        {tFormat(
                                            STRINGS.i18n_input.copy_from_active,
                                            activeLocale,
                                            { locale: LOCALE_SHORT[activeLocale] },
                                        )}
                                    </button>
                                ) : null}
                            </div>
                        );
                    })}
                    <button
                        type="button"
                        data-testid={`${testIdPrefix}-translations-hide`}
                        onClick={() => setTranslationsOpen(false)}
                        className="inline-flex w-fit items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                    >
                        {t(STRINGS.i18n_input.hide_translations, activeLocale)}
                    </button>
                </div>
            )}
        </div>
    );
}
