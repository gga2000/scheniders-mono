"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/providers/language-provider";

interface QCShortcutsHelpProps {
    open: boolean;
    onClose: () => void;
}

interface ShortcutRow {
    keys: string[][]; // array of key-combo alternatives (each alternative is an array of keys pressed together)
    labelKey: string;
}

interface ShortcutSection {
    titleKey: string;
    rows: ShortcutRow[];
}

const SECTIONS: ShortcutSection[] = [
    {
        titleKey: "qc.shortcuts.section.navigation",
        rows: [
            { keys: [["/"]], labelKey: "qc.shortcuts.focusSearch" },
            { keys: [["J"], ["↓"]], labelKey: "qc.shortcuts.nextItem" },
            { keys: [["K"], ["↑"]], labelKey: "qc.shortcuts.prevItem" },
        ],
    },
    {
        titleKey: "qc.shortcuts.section.selection",
        rows: [
            { keys: [["X"]], labelKey: "qc.shortcuts.toggleSelect" },
            { keys: [["Esc"]], labelKey: "qc.shortcuts.clearSelection" },
        ],
    },
    {
        titleKey: "qc.shortcuts.section.actions",
        rows: [
            { keys: [["R"]], labelKey: "qc.shortcuts.bulkRestock" },
            { keys: [["W"]], labelKey: "qc.shortcuts.bulkWriteOff" },
            { keys: [["E"]], labelKey: "qc.shortcuts.bulkReturn" },
        ],
    },
    {
        titleKey: "qc.shortcuts.section.general",
        rows: [{ keys: [["?"]], labelKey: "qc.shortcuts.toggleHelp" }],
    },
];

function Kbd({ children }: { children: React.ReactNode }) {
    return (
        <kbd className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2 rounded-md border border-[var(--card-border)] bg-[var(--background)] text-[11px] font-semibold text-foreground shadow-[0_1px_0_0_rgba(0,0,0,0.05)] tabular-nums">
            {children}
        </kbd>
    );
}

export function QCShortcutsHelp({ open, onClose }: QCShortcutsHelpProps) {
    const { t } = useLanguage();

    // Close on Escape (at the overlay level — container's keyboard hook also handles `?` to toggle)
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                onClose();
            }
        };
        window.addEventListener("keydown", handler, true);
        return () => window.removeEventListener("keydown", handler, true);
    }, [open, onClose]);

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        key="qc-shortcuts-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        onClick={onClose}
                        className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
                    />
                    <motion.div
                        key="qc-shortcuts-modal"
                        initial={{ opacity: 0, scale: 0.96, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 8 }}
                        transition={{ type: "spring", stiffness: 320, damping: 28 }}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="qc-shortcuts-title"
                        className="fixed left-1/2 top-1/2 z-[61] w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl overflow-hidden"
                    >
                        <div className="flex items-start justify-between px-5 py-4 border-b border-[var(--card-border)]">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                                    <Keyboard className="w-4.5 h-4.5 text-amber-600" />
                                </div>
                                <div className="min-w-0">
                                    <h2 id="qc-shortcuts-title" className="text-base font-bold truncate">
                                        {t("qc.shortcuts.title")}
                                    </h2>
                                    <p className="text-xs text-muted mt-0.5 truncate">{t("qc.shortcuts.subtitle")}</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                aria-label={t("qc.shortcuts.close")}
                                className="p-1.5 rounded-lg hover:bg-[var(--background)] text-muted hover:text-foreground transition flex-shrink-0"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
                            {SECTIONS.map((section) => (
                                <div key={section.titleKey}>
                                    <h3 className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">
                                        {t(section.titleKey)}
                                    </h3>
                                    <ul className="space-y-1.5">
                                        {section.rows.map((row) => (
                                            <li
                                                key={row.labelKey}
                                                className={cn(
                                                    "flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-[var(--background)]/40 border border-transparent hover:border-[var(--card-border)] transition"
                                                )}
                                            >
                                                <span className="text-sm text-foreground">{t(row.labelKey)}</span>
                                                <span className="flex items-center gap-1.5 flex-shrink-0">
                                                    {row.keys.map((combo, i) => (
                                                        <span key={i} className="flex items-center gap-1">
                                                            {i > 0 && (
                                                                <span className="text-[10px] text-muted uppercase">
                                                                    {t("qc.shortcuts.or")}
                                                                </span>
                                                            )}
                                                            {combo.map((k, j) => (
                                                                <Kbd key={j}>{k}</Kbd>
                                                            ))}
                                                        </span>
                                                    ))}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>

                        <div className="px-5 py-3 border-t border-[var(--card-border)] bg-[var(--background)]/40">
                            <p className="text-xs text-muted">
                                {t("qc.shortcuts.hint", { key: "?" })}
                            </p>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
