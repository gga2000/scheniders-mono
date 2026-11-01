"use client";

import { useState } from "react";
import { Settings, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useLanguage } from "@/hooks/use-language";

interface AdvancedOptionsSectionProps {
    children: React.ReactNode;
}

export function AdvancedOptionsSection({ children }: AdvancedOptionsSectionProps) {
    const { t } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="space-y-2">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl text-sm font-medium text-muted hover:text-foreground hover:bg-[var(--background)] transition-all"
            >
                <Settings className="w-4 h-4" />
                {t("products.adv.title")}
                <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                />
            </button>
            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="overflow-hidden"
                    >
                        <div className="space-y-4 pt-2">
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
