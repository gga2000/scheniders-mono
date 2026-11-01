"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { translations, Locale } from "@/lib/i18n";

type TranslateArg = string | Record<string, string | number>;

interface LanguageContextType {
    language: Locale;
    setLanguage: (lang: Locale) => void;
    t: (key: string, fallbackOrVars?: TranslateArg, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType>({
    language: "ar",
    setLanguage: () => { },
    t: (key: string, fallbackOrVars?: TranslateArg) =>
        typeof fallbackOrVars === "string" ? fallbackOrVars : key,
});

const STORAGE_KEY = "schneiders_language";

function interpolate(template: string, vars?: Record<string, string | number>): string {
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

/**
 * The text for `key`. When the call passes `count: 1` and the dictionary has a
 * `<key>.one` entry, that singular form is used ("1 order", not "1 orders").
 * Languages that need no separate singular simply omit the entry.
 */
function lookup(
    language: Locale,
    key: string,
    vars: Record<string, string | number> | undefined,
): string | undefined {
    const one = vars?.count === 1 ? `${key}.one` : null;
    const singular = one ? translations[language]?.[one] : undefined;
    return singular ?? translations[language]?.[key] ?? translations.en?.[key];
}

function resolveFallback(
    fallbackOrVars: TranslateArg | undefined,
    vars: Record<string, string | number> | undefined,
): { fallback: string | undefined; vars: Record<string, string | number> | undefined } {
    if (typeof fallbackOrVars === "string") {
        return { fallback: fallbackOrVars, vars };
    }
    return { fallback: undefined, vars: fallbackOrVars };
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [language, setLanguageState] = useState<Locale>("ar");
    const [mounted, setMounted] = useState(false);

    // Load persisted language on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored === "ar" || stored === "en") {
                setLanguageState(stored);
            }
        } catch { }
        setMounted(true);
    }, []);

    useEffect(() => {
        if (typeof document === "undefined") return;
        document.documentElement.lang = language;
    }, [language]);

    const setLanguage = useCallback((lang: Locale) => {
        setLanguageState(lang);
        try {
            localStorage.setItem(STORAGE_KEY, lang);
        } catch { }
    }, []);

    const t = useCallback(
        (
            key: string,
            fallbackOrVars?: TranslateArg,
            varsArg?: Record<string, string | number>,
        ): string => {
            const { fallback, vars } = resolveFallback(fallbackOrVars, varsArg);
            const raw = lookup(language, key, vars) ?? fallback ?? key;
            return interpolate(raw, vars);
        },
        [language]
    );

    // Avoid hydration mismatch — render children with default "ar" until mounted
    const value = {
        language: mounted ? language : "ar",
        setLanguage,
        t: mounted
            ? t
            : (
                key: string,
                fallbackOrVars?: TranslateArg,
                varsArg?: Record<string, string | number>,
            ) => {
                const { fallback, vars } = resolveFallback(fallbackOrVars, varsArg);
                const raw = lookup("ar", key, vars) ?? fallback ?? key;
                return interpolate(raw, vars);
            },
    };

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    return useContext(LanguageContext);
}

export { LanguageContext };
