"use client";

import { motion } from "framer-motion";
import { Sparkles, CheckCircle2, Filter } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";

interface QCEmptyStateProps {
    variant: "all-clear" | "no-matches" | "no-resolved";
    onClearFilters?: () => void;
}

export function QCEmptyState({ variant, onClearFilters }: QCEmptyStateProps) {
    const { t } = useLanguage();
    if (variant === "no-matches") {
        return (
            <div className="py-16 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--background)] mb-4">
                    <Filter className="w-8 h-8 text-muted" />
                </div>
                <h3 className="text-lg font-bold mb-1">{t("qc.empty.noMatches.title")}</h3>
                <p className="text-sm text-muted mb-4">{t("qc.empty.noMatches.desc")}</p>
                {onClearFilters && (
                    <button
                        onClick={onClearFilters}
                        className="px-4 py-2 bg-[var(--ink)] text-white text-sm font-medium rounded-lg hover:opacity-90 transition"
                    >
                        {t("qc.empty.noMatches.clear")}
                    </button>
                )}
            </div>
        );
    }

    if (variant === "no-resolved") {
        return (
            <div className="py-16 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/10 mb-4">
                    <CheckCircle2 className="w-8 h-8 text-blue-500" />
                </div>
                <h3 className="text-lg font-bold mb-1">{t("qc.empty.noResolved.title")}</h3>
                <p className="text-sm text-muted">{t("qc.empty.noResolved.desc")}</p>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="py-16 text-center relative overflow-hidden"
        >
            <div className="absolute inset-0 pointer-events-none">
                {[...Array(6)].map((_, i) => (
                    <motion.div
                        key={i}
                        className="absolute"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: [0, 1, 0], y: [-20, -60] }}
                        transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
                        style={{ left: `${20 + i * 12}%`, top: "50%" }}
                    >
                        <Sparkles className="w-5 h-5 text-emerald-400" />
                    </motion.div>
                ))}
            </div>
            <div className="relative">
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.1, type: "spring" }}
                    className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-emerald-500/10 mb-4"
                >
                    <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                </motion.div>
                <h3 className="text-xl font-bold mb-1">{t("qc.empty.allClear.title")}</h3>
                <p className="text-sm text-muted max-w-sm mx-auto">
                    {t("qc.empty.allClear.desc")}
                </p>
            </div>
        </motion.div>
    );
}
