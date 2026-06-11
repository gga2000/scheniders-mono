"use client";

// =====================================================================
// I18nStringInput — locale-aware text input for `I18nString`
// =====================================================================
// Behaviour:
//   - The "active" locale (passed from the editor toolbar via prop, or
//     overridden locally by clicking a pill) is rendered prominently at
//     the top, full width.
//   - The other supported locales render as compact "+ AR / + KU" buttons
//     that expand to inline secondary inputs.
//   - When `activeLocale` prop changes (user toggles in toolbar), the
//     component re-binds the primary input to the new locale.
//   - Clicking a non-active locale PILL switches the primary input to
//     that locale (in-component override) — this matches the prior UX.
//   - English is the canonical fallback: if a non-EN locale is empty,
//     we show "Fallback from EN: ..." under the primary input.
// =====================================================================

import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Plus } from "lucide-react";
import type {
    I18nString,
    LocaleCode,
} from "@scheniders/shared";
import {
    SUPPORTED_LOCALES,
    LOCALE_LABELS,
} from "@scheniders/shared";
import { cn } from "@/lib/utils";

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
     * Locale currently selected in the editor toolbar. The matching field
     * renders expanded and large by default; others render as compact
     * inline inputs that can be toggled open.
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
    // Local override — lets the user click a pill to flip the primary
    // input without having to go up to the toolbar. Resets whenever the
    // prop-driven `activeLocale` changes.
    const [localActive, setLocalActive] = useState<LocaleCode>(activeLocale);
    useEffect(() => {
        setLocalActive(activeLocale);
    }, [activeLocale]);

    // Which non-active locales are currently expanded inline?
    const [expanded, setExpanded] = useState<Set<LocaleCode>>(() => {
        const s = new Set<LocaleCode>();
        for (const loc of SUPPORTED_LOCALES) {
            if (loc !== activeLocale && value?.[loc]) s.add(loc);
        }
        return s;
    });

    useEffect(() => {
        setExpanded((prev) => {
            const next = new Set<LocaleCode>(prev);
            next.delete(localActive);
            for (const loc of SUPPORTED_LOCALES) {
                if (loc !== localActive && value?.[loc] && !next.has(loc)) {
                    next.add(loc);
                }
            }
            return next;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [localActive]);

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
    const activeValue = value?.[localActive] ?? "";
    const showFallback = localActive !== "en" && !activeValue && !!enValue;

    const secondaryLocales = useMemo(
        () => SUPPORTED_LOCALES.filter((l) => l !== localActive),
        [localActive],
    );

    const expand = (loc: LocaleCode): void => {
        setExpanded((prev) => {
            const next = new Set<LocaleCode>(prev);
            next.add(loc);
            return next;
        });
    };

    const collapse = (loc: LocaleCode): void => {
        setExpanded((prev) => {
            const next = new Set<LocaleCode>(prev);
            next.delete(loc);
            return next;
        });
    };

    return (
        <div
            className="space-y-2"
            data-testid={`${testIdPrefix}-root`}
            data-active-locale={localActive}
        >
            {/* Locale chips. */}
            <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium">{label}</label>
                <div
                    className="flex items-center gap-1"
                    role="tablist"
                    aria-label="Locale"
                >
                    {SUPPORTED_LOCALES.map((loc) => {
                        const isActive = loc === localActive;
                        const hasContent = !!value?.[loc];
                        return (
                            <button
                                key={loc}
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                data-testid={`${testIdPrefix}-locale-${loc}`}
                                onClick={() => setLocalActive(loc)}
                                title={LOCALE_LABELS[loc]}
                                className={cn(
                                    "relative inline-flex h-6 items-center gap-1 rounded-full px-2 text-[10px] font-semibold uppercase tracking-wider transition-colors",
                                    isActive
                                        ? "bg-foreground text-background"
                                        : "bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                                )}
                            >
                                {LOCALE_SHORT[loc]}
                                {hasContent && (
                                    <span
                                        aria-hidden="true"
                                        className={cn(
                                            "h-1.5 w-1.5 rounded-full",
                                            isActive ? "bg-emerald-300" : "bg-emerald-500",
                                        )}
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Active-locale field — large/primary. */}
            <div data-testid={`${testIdPrefix}-active`} data-locale={localActive}>
                {multiline ? (
                    <textarea
                        data-testid={`${testIdPrefix}-textarea`}
                        value={activeValue}
                        onChange={(e) => updateLocale(localActive, e.target.value)}
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
                        onChange={(e) => updateLocale(localActive, e.target.value)}
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
                        <span>Fallback from EN: </span>
                        <span className="italic">&ldquo;{enValue}&rdquo;</span>
                    </div>
                )}

                {helperText && !showFallback && (
                    <p className="mt-1 text-[11px] text-muted-foreground">{helperText}</p>
                )}
            </div>

            {/* Secondary locales — collapsed by default. */}
            <div className="flex flex-col gap-1.5" data-testid={`${testIdPrefix}-secondary`}>
                {secondaryLocales.map((loc) => {
                    const isOpen = expanded.has(loc);
                    const localeValue = value?.[loc] ?? "";
                    if (!isOpen) {
                        return (
                            <button
                                key={loc}
                                type="button"
                                data-testid={`${testIdPrefix}-expand-${loc}`}
                                onClick={() => expand(loc)}
                                className="inline-flex w-fit items-center gap-1 rounded-md bg-muted/40 px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                            >
                                <Plus className="h-3 w-3" aria-hidden="true" />
                                {LOCALE_SHORT[loc]}
                                {localeValue && (
                                    <span
                                        aria-hidden="true"
                                        className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                                    />
                                )}
                            </button>
                        );
                    }
                    return (
                        <div
                            key={loc}
                            data-testid={`${testIdPrefix}-secondary-${loc}`}
                            className="flex items-center gap-2"
                        >
                            <span
                                className="inline-flex h-6 w-9 shrink-0 items-center justify-center rounded-md bg-muted/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
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
                            <button
                                type="button"
                                aria-label={`Collapse ${LOCALE_LABELS[loc]}`}
                                data-testid={`${testIdPrefix}-collapse-${loc}`}
                                onClick={() => collapse(loc)}
                                className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                            >
                                ×
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
