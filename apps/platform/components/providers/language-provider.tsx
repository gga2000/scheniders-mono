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

/** One PluralRules per language: "one", "two", "few", "many", "zero" or "other" for a count. */
const PLURAL_RULES: Record<Locale, Intl.PluralRules> = {
    en: new Intl.PluralRules("en"),
    ar: new Intl.PluralRules("ar"),
};

/**
 * The text for `key`. When the call passes a numeric `count`, the language's
 * plural form for it is used if the dictionary has one: `<key>.one` ("1 order",
 * not "1 orders"), and for Arabic also `<key>.two` (the dual), `<key>.few`
 * (3–10, plural noun), `<key>.many` (11–99, singular accusative) and
 * `<key>.zero`. The plain `<key>` is the "other" form and the fallback, so a
 * language that needs no separate form simply omits the entry.
 */
function lookup(
    language: Locale,
    key: string,
    vars: Record<string, string | number> | undefined,
): string | undefined {
    const count = vars?.count;
    const category = typeof count === "number" ? PLURAL_RULES[language].select(count) : "other";
    const form = category === "other" ? undefined : translations[language]?.[`${key}.${category}`];
    return form ?? translations[language]?.[key] ?? translations.en?.[key];
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
