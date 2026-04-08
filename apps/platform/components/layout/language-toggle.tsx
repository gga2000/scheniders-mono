"use client";

import { useLanguage } from "@/hooks/use-language";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function LanguageToggle() {
    const { language, setLanguage, t } = useLanguage();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return (
            <div className="w-10 h-10 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center text-muted" />
        );
    }

    const isArabic = language === "ar";

    return (
        <button
            onClick={() => setLanguage(isArabic ? "en" : "ar")}
            className="relative w-10 h-10 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center text-muted hover:text-foreground hover:border-[var(--foreground-muted)] transition-all overflow-hidden"
            title={t("language.switch")}
            aria-label={t("language.switch")}
        >
            <motion.div
                initial={false}
                animate={{
                    scale: isArabic ? 0 : 1,
                    rotate: isArabic ? 90 : 0,
                    opacity: isArabic ? 0 : 1,
                }}
                transition={{ duration: 0.2 }}
                className="absolute text-sm font-bold"
            >
                ع
            </motion.div>

            <motion.div
                initial={false}
                animate={{
                    scale: isArabic ? 1 : 0,
                    rotate: isArabic ? 0 : -90,
                    opacity: isArabic ? 1 : 0,
                }}
                transition={{ duration: 0.2 }}
                className="absolute text-xs font-bold"
            >
                EN
            </motion.div>
        </button>
    );
}
