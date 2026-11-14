"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import * as Sentry from "@sentry/nextjs";
import type { Locale } from "@/lib/i18n";
// Arabic is the default and the language every page renders first, so it ships
// with the app. English (another ~400 kB) loads only for someone who picks it.
import { ar } from "@/lib/i18n-ar";

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
 * (3–10, plural noun) and `<key>.many` (11–99, singular accusative). A count
 * of 0 takes `<key>.zero` in every language ("none finished yet", not
 * "0 finished"), although English grammar files 0 under "other". The plain
 * `<key>` is the "other" form and the fallback, so a language that needs no
 * separate form simply omits the entry.
 */
function lookup(
    dict: Record<string, string>,
    language: Locale,
    key: string,
    vars: Record<string, string | number> | undefined,
): string | undefined {
    const count = vars?.count;
    const category = typeof count !== "number" ? "other"
        : count === 0 ? "zero"
        : PLURAL_RULES[language].select(count);
    const form = category === "other" ? undefined : dict[`${key}.${category}`];
    return form ?? dict[key];
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

/** The English dictionary once it has been loaded; later providers start with it. */
let englishCache: Record<string, string> | null = null;

/** Loads English (its own ~400 kB chunk) and keeps it for every provider after. */
export function loadEnglish(): Promise<Record<string, string>> {
    return import("@/lib/i18n-en").then((m) => (englishCache = m.en));
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [language, setLanguageState] = useState<Locale>("ar");
    const [mounted, setMounted] = useState(false);
    const [en, setEn] = useState<Record<string, string> | null>(() => englishCache);

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
        if (language !== "en" || en) return;
        let live = true;
        loadEnglish()
            .then((dict) => { if (live) setEn(dict); })
            // The page stays in Arabic; the failed chunk load is reported.
            .catch((err: unknown) => Sentry.captureException(err));
        return () => { live = false; };
    }, [language, en]);

    // Until the English dictionary has arrived the page reads in Arabic, as it
    // does before mount.
    const active: Locale = language === "en" && en ? "en" : "ar";
    const dict = active === "en" && en ? en : ar;

    useEffect(() => {
        if (typeof document === "undefined") return;
        document.documentElement.lang = active;
    }, [active]);

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
            const raw = lookup(dict, active, key, vars) ?? fallback ?? key;
            return interpolate(raw, vars);
        },
        [dict, active]
    );

    // Avoid hydration mismatch — render children with default "ar" until mounted
    const value = {
        language: mounted ? active : "ar",
        setLanguage,
        t: mounted
            ? t
            : (
                key: string,
                fallbackOrVars?: TranslateArg,
                varsArg?: Record<string, string | number>,
            ) => {
                const { fallback, vars } = resolveFallback(fallbackOrVars, varsArg);
                const raw = lookup(ar, "ar", key, vars) ?? fallback ?? key;
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
