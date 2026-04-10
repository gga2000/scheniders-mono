"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { translations, Locale } from "@/lib/i18n";

interface LanguageContextType {
    language: Locale;
    setLanguage: (lang: Locale) => void;
    t: (key: string, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType>({
    language: "ar",
    setLanguage: () => { },
    t: (key: string) => key,
});

const STORAGE_KEY = "schneiders_language";

function interpolate(template: string, vars?: Record<string, string | number>): string {
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
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

    const setLanguage = useCallback((lang: Locale) => {
        setLanguageState(lang);
        try {
            localStorage.setItem(STORAGE_KEY, lang);
        } catch { }
    }, []);

    const t = useCallback(
        (key: string, vars?: Record<string, string | number>): string => {
            const raw = translations[language]?.[key] ?? translations.en?.[key] ?? key;
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
            : (key: string, vars?: Record<string, string | number>) => interpolate(translations.ar?.[key] ?? translations.en?.[key] ?? key, vars),
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
