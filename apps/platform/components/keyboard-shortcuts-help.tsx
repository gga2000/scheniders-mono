"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Keyboard, X } from "lucide-react";
import {
    KeyboardShortcut,
    DEFAULT_SHORTCUT_CATEGORIES,
    formatShortcutKey,
} from "@/hooks/use-keyboard-shortcuts";
import { useLanguage } from "@/hooks/use-language";

interface KeyboardShortcutsHelpProps {
    open: boolean;
    onClose: () => void;
    shortcuts: KeyboardShortcut[];
}

export function KeyboardShortcutsHelp({
    open,
    onClose,
    shortcuts,
}: KeyboardShortcutsHelpProps) {
    const { t } = useLanguage();
    // Group shortcuts by category
    const groupedShortcuts = shortcuts.reduce((acc, shortcut) => {
        const category = shortcut.category || "general";
        if (!acc[category]) acc[category] = [];
        acc[category].push(shortcut);
        return acc;
    }, {} as Record<string, KeyboardShortcut[]>);

    // Remove duplicates (same key in same category)
    Object.keys(groupedShortcuts).forEach((category) => {
        const seen = new Set<string>();
        groupedShortcuts[category] = groupedShortcuts[category].filter((s) => {
            const key = formatShortcutKey(s);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    });

    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
                        onClick={onClose}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed inset-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[600px] md:max-h-[80vh] bg-background border border-border rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-border">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <Keyboard className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-foreground">
                                        {t("shortcuts.title")}
                                    </h2>
                                    <p className="text-sm text-muted-foreground">
                                        {t("shortcuts.subtitle", { key: "?" })}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-lg hover:bg-surface transition-colors text-muted-foreground"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-6">
                            {Object.entries(groupedShortcuts).map(([category, items]) => (
                                <div key={category}>
                                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                                        {DEFAULT_SHORTCUT_CATEGORIES[category as keyof typeof DEFAULT_SHORTCUT_CATEGORIES]?.labelAr || category}
                                    </h3>
                                    <div className="grid gap-2">
                                        {items.map((shortcut, idx) => (
                                            <div
                                                key={`${shortcut.key}-${idx}`}
                                                className="flex items-center justify-between p-3 rounded-xl bg-surface/50 border border-border/50"
                                            >
                                                <div className="flex-1">
                                                    <span className="font-medium text-foreground">
                                                        {shortcut.labelAr}
                                                    </span>
                                                    {shortcut.descriptionAr && (
                                                        <p className="text-sm text-muted-foreground mt-0.5">
                                                            {shortcut.descriptionAr}
                                                        </p>
                                                    )}
                                                </div>
                                                <kbd className="px-3 py-1.5 rounded-lg bg-background border border-border text-sm font-mono font-medium text-foreground shadow-sm">
                                                    {formatShortcutKey(shortcut)}
                                                </kbd>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-border bg-surface/50">
                            <p className="text-xs text-muted-foreground text-center">
                                {t("shortcuts.footer")}
                            </p>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
