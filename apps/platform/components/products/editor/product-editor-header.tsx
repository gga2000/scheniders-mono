"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Save, RotateCcw, Circle, Copy } from "lucide-react";
import { motion } from "framer-motion";
import { useLanguage } from "@/hooks/use-language";

interface ProductEditorHeaderProps {
    productName: string;
    mode: "create" | "edit";
    isDirty: boolean;
    saving: boolean;
    status: 'draft' | 'active' | 'archived';
    onSave: () => void;
    onDiscard: () => void;
    onDuplicate?: () => void;
    children?: React.ReactNode;
}

export function ProductEditorHeader({
    productName,
    mode,
    isDirty,
    saving,
    status,
    onSave,
    onDiscard,
    onDuplicate,
    children,
}: ProductEditorHeaderProps) {
    const router = useRouter();
    const { t } = useLanguage();

    const statusColors = {
        draft: "bg-amber-100 text-amber-800",
        active: "bg-emerald-100 text-emerald-800",
        archived: "bg-gray-100 text-gray-600",
    };

    return (
        <div className="sticky top-0 z-30 bg-[var(--background)]/80 backdrop-blur-xl border-b border-[var(--card-border)]">
            <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2 sm:gap-4">
                {/* Left: Back + Title */}
                <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                    <button
                        onClick={() => router.push("/products")}
                        aria-label={t("products.ed.back")}
                        className="p-2 rounded-xl hover:bg-[var(--card-bg)] transition-colors shrink-0"
                    >
                        <ArrowLeft className="w-5 h-5 text-muted" />
                    </button>
                    <div className="min-w-0">
                        <h1 className="text-lg font-bold text-foreground truncate">
                            {mode === "create" ? t("products.ed.newProduct") : (productName || t("products.ed.untitled"))}
                        </h1>
                    </div>
                    <span className={`hidden sm:inline px-3 py-1 rounded-full text-xs font-medium shrink-0 ${statusColors[status]}`}>
                        {t(`products.ed.status.${status}`)}
                    </span>
                    {children ? (
                        <div className="shrink-0">{children}</div>
                    ) : isDirty ? (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex items-center gap-1.5 text-amber-600 shrink-0"
                        >
                            <Circle className="w-2 h-2 fill-current" />
                            <span className="text-xs font-medium">{t("products.ed.unsaved")}</span>
                        </motion.div>
                    ) : null}
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    {mode === "edit" && onDuplicate && (
                        <button
                            onClick={onDuplicate}
                            aria-label={t("products.ed.duplicate")}
                            className="px-3 sm:px-4 py-2.5 bg-[var(--card-bg)] border border-[var(--card-border)] text-foreground rounded-xl text-sm font-medium hover:bg-[var(--background)] transition-colors flex items-center gap-2"
                        >
                            <Copy className="w-4 h-4" />
                            <span className="hidden sm:inline">{t("products.ed.duplicate")}</span>
                        </button>
                    )}
                    {isDirty && (
                        <button
                            onClick={onDiscard}
                            aria-label={t("products.ed.discard")}
                            className="px-3 sm:px-4 py-2.5 bg-[var(--card-bg)] border border-[var(--card-border)] text-foreground rounded-xl text-sm font-medium hover:bg-[var(--background)] transition-colors flex items-center gap-2"
                        >
                            <RotateCcw className="w-4 h-4" />
                            <span className="hidden sm:inline">{t("products.ed.discard")}</span>
                        </button>
                    )}
                    <button
                        onClick={onSave}
                        disabled={saving || (!isDirty && mode === "edit")}
                        className="px-4 sm:px-6 py-2.5 bg-[var(--ink)] text-white rounded-xl text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {saving ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                {t("products.ed.saving")}
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                {mode === "create" ? t("products.ed.create") : t("products.ed.save")}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
