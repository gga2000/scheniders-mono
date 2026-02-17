"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { translations, Locale } from "@/lib/i18n";

interface LanguageContextType {
    language: Locale;
    setLanguage: (lang: Locale) => void;
    t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
    language: "en",
    setLanguage: () => { },
    t: (key: string) => key,
});

const STORAGE_KEY = "schneiders_language";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [language, setLanguageState] = useState<Locale>("en");
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
        (key: string): string => {
            return translations[language]?.[key] ?? translations.en?.[key] ?? key;
        },
        [language]
    );

    // Avoid hydration mismatch — render children with default "en" until mounted
    const value = {
        language: mounted ? language : "en",
        setLanguage,
        t: mounted ? t : (key: string) => translations.en?.[key] ?? key,
    };

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    );
}

export { LanguageContext };
