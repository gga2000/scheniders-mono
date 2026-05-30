"use client";

import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { motion, AnimatePresence } from "framer-motion";
import {
    Keyboard,
    X,
    Plus,
    Search,
    Command,
    LayoutGrid,
    List,
    FolderTree,
    Kanban,
    Flame,
    CheckSquare,
    XCircle,
    Pencil,
    Copy,
    Trash2,
    DollarSign,
    HelpCircle,
    FolderInput,
} from "lucide-react";
import { useProductStore } from "@/store/use-product-store";
import { CategorySwitcherOverlay } from "@/components/products/category-switcher-overlay";

// =============================================
// TYPES
// =============================================

interface KeyboardShortcutsProviderProps {
    children: React.ReactNode;
    onNewProduct?: () => void;
    onFocusSearch?: () => void;
    onOpenCommandPalette?: () => void;
    onChangeView?: (view: string) => void;
    onSelectAll?: () => void;
    onClearSelection?: () => void;
    onEditSelected?: () => void;
    onDuplicateSelected?: () => void;
    onArchiveSelected?: () => void;
    onBulkPrice?: () => void;
    selectedCount?: number;
}

interface ShortcutDef {
    keys: string[];
    label: string;
    labelAr: string;
    icon: React.ReactNode;
    category: "navigation" | "selection" | "actions" | "views";
}

// =============================================
// CONTEXT
// =============================================

interface KeyboardShortcutsContextValue {
    showHelp: boolean;
    setShowHelp: (v: boolean) => void;
}

const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextValue>({
    showHelp: false,
    setShowHelp: () => {},
});

export function useProductShortcuts() {
    return useContext(KeyboardShortcutsContext);
}

// =============================================
// HELPERS
// =============================================

const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
const modKey = isMac ? "⌘" : "Ctrl";

function isInputFocused(): boolean {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if ((el as HTMLElement).isContentEditable) return true;
    return false;
}

// =============================================
// SHORTCUT DEFINITIONS (for help modal)
// =============================================

const SHORTCUT_DEFS: ShortcutDef[] = [
    {
        keys: ["N"],
        label: "New Product",
        labelAr: "منتج جديد",
        icon: <Plus className="w-4 h-4" />,
        category: "actions",
    },
    {
        keys: ["F", "/"],
        label: "Focus Search",
        labelAr: "البحث",
        icon: <Search className="w-4 h-4" />,
        category: "navigation",
    },
    {
        keys: [`${modKey}+K`],
        label: "Command Palette",
        labelAr: "لوحة الأوامر",
        icon: <Command className="w-4 h-4" />,
        category: "navigation",
    },
    {
        keys: ["G → G"],
        label: "Grid View",
        labelAr: "عرض الشبكة",
        icon: <LayoutGrid className="w-4 h-4" />,
        category: "views",
    },
    {
        keys: ["G → L"],
        label: "List View",
        labelAr: "عرض القائمة",
        icon: <List className="w-4 h-4" />,
        category: "views",
    },
    {
        keys: ["G → C"],
        label: "Category View",
        labelAr: "عرض الفئات",
        icon: <FolderTree className="w-4 h-4" />,
        category: "views",
    },
    {
        keys: ["G → K"],
        label: "Kanban View",
        labelAr: "عرض كانبان",
        icon: <Kanban className="w-4 h-4" />,
        category: "views",
    },
    {
        keys: ["G → H"],
        label: "Heatmap View",
        labelAr: "عرض الخريطة الحرارية",
        icon: <Flame className="w-4 h-4" />,
        category: "views",
    },
    {
        keys: [`${modKey}+A`],
        label: "Select All",
        labelAr: "تحديد الكل",
        icon: <CheckSquare className="w-4 h-4" />,
        category: "selection",
    },
    {
        keys: ["Esc"],
        label: "Clear Selection",
        labelAr: "إلغاء التحديد",
        icon: <XCircle className="w-4 h-4" />,
        category: "selection",
    },
    {
        keys: ["E"],
        label: "Edit Selected",
        labelAr: "تعديل المحدد",
        icon: <Pencil className="w-4 h-4" />,
        category: "actions",
    },
    {
        keys: ["D"],
        label: "Duplicate Selected",
        labelAr: "نسخ المحدد",
        icon: <Copy className="w-4 h-4" />,
        category: "actions",
    },
    {
        keys: ["Del / ⌫"],
        label: "Archive Selected",
        labelAr: "أرشفة المحدد",
        icon: <Trash2 className="w-4 h-4" />,
        category: "actions",
    },
    {
        keys: ["P"],
        label: "Bulk Price Update",
        labelAr: "تحديث الأسعار بالجملة",
        icon: <DollarSign className="w-4 h-4" />,
        category: "actions",
    },
    {
        keys: ["C"],
        label: "Categorize selected",
        labelAr: "تصنيف المحدد",
        icon: <FolderInput className="w-4 h-4" />,
        category: "actions",
    },
    {
        keys: ["?"],
        label: "Show Shortcuts",
        labelAr: "إظهار الاختصارات",
        icon: <HelpCircle className="w-4 h-4" />,
        category: "navigation",
    },
];

const CATEGORIES = {
    navigation: { label: "Navigation", labelAr: "التنقل" },
    views: { label: "Views", labelAr: "طرق العرض" },
    selection: { label: "Selection", labelAr: "التحديد" },
    actions: { label: "Actions", labelAr: "الإجراءات" },
} as const;

// =============================================
// PROVIDER
// =============================================

export function KeyboardShortcutsProvider({
    children,
    onNewProduct,
    onFocusSearch,
    onOpenCommandPalette,
    onChangeView,
    onSelectAll,
    onClearSelection,
    onEditSelected,
    onDuplicateSelected,
    onArchiveSelected,
    onBulkPrice,
    selectedCount = 0,
}: KeyboardShortcutsProviderProps) {
    const [showHelp, setShowHelp] = useState(false);
    const [categorySwitcherOpen, setCategorySwitcherOpen] = useState(false);

    // Pull live selection from the product store so the overlay can operate
    // on all currently-selected products regardless of what `selectedCount`
    // the caller chose to pipe through.
    const selectedIdsSet = useProductStore((s) => s.selectedIds);

    // Chord state: track first key of a two-key chord (e.g. "G" then "L")
    const chordKeyRef = useRef<string | null>(null);
    const chordTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearChord = useCallback(() => {
        chordKeyRef.current = null;
        if (chordTimeoutRef.current) {
            clearTimeout(chordTimeoutRef.current);
            chordTimeoutRef.current = null;
        }
    }, []);

    const startChord = useCallback(
        (key: string) => {
            chordKeyRef.current = key;
            if (chordTimeoutRef.current) clearTimeout(chordTimeoutRef.current);
            chordTimeoutRef.current = setTimeout(() => {
                chordKeyRef.current = null;
            }, 500);
        },
        []
    );

    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            const isInput = isInputFocused();
            const isCmd = e.metaKey || e.ctrlKey;

            // Cmd/Ctrl+K — command palette (works always)
            if (isCmd && e.key === "k") {
                e.preventDefault();
                onOpenCommandPalette?.();
                return;
            }

            // Cmd/Ctrl+A — select all (only when not in input)
            if (isCmd && e.key === "a" && !isInput) {
                e.preventDefault();
                onSelectAll?.();
                return;
            }

            // Skip all other shortcuts when focused on input
            if (isInput) return;

            // If we're in a chord sequence
            if (chordKeyRef.current === "g") {
                clearChord();
                const viewMap: Record<string, string> = {
                    g: "grid",
                    l: "list",
                    c: "category",
                    k: "kanban",
                    h: "heatmap",
                };
                const view = viewMap[e.key.toLowerCase()];
                if (view) {
                    e.preventDefault();
                    onChangeView?.(view);
                }
                return;
            }

            // Single-key shortcuts
            switch (e.key.toLowerCase()) {
                case "n":
                    e.preventDefault();
                    onNewProduct?.();
                    break;

                case "f":
                case "/":
                    e.preventDefault();
                    onFocusSearch?.();
                    break;

                case "g":
                    e.preventDefault();
                    startChord("g");
                    break;

                case "escape":
                    if (showHelp) {
                        setShowHelp(false);
                    } else {
                        onClearSelection?.();
                    }
                    break;

                case "e":
                    if (selectedCount > 0) {
                        e.preventDefault();
                        onEditSelected?.();
                    }
                    break;

                case "d":
                    if (selectedCount > 0) {
                        e.preventDefault();
                        onDuplicateSelected?.();
                    }
                    break;

                case "delete":
                case "backspace":
                    if (selectedCount > 0) {
                        e.preventDefault();
                        onArchiveSelected?.();
                    }
                    break;

                case "p":
                    if (selectedCount > 0) {
                        e.preventDefault();
                        onBulkPrice?.();
                    }
                    break;

                case "c":
                    if (selectedIdsSet.size >= 1) {
                        e.preventDefault();
                        setCategorySwitcherOpen(true);
                    }
                    break;

                case "?":
                    e.preventDefault();
                    setShowHelp((prev) => !prev);
                    break;
            }
        }

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            if (chordTimeoutRef.current) clearTimeout(chordTimeoutRef.current);
        };
    }, [
        showHelp,
        selectedCount,
        onNewProduct,
        onFocusSearch,
        onOpenCommandPalette,
        onChangeView,
        onSelectAll,
        onClearSelection,
        onEditSelected,
        onDuplicateSelected,
        onArchiveSelected,
        onBulkPrice,
        clearChord,
        startChord,
        selectedIdsSet,
    ]);

    return (
        <KeyboardShortcutsContext.Provider value={{ showHelp, setShowHelp }}>
            {children}
            <KeyboardShortcutsHelp open={showHelp} onClose={() => setShowHelp(false)} />
            <CategorySwitcherOverlay
                open={categorySwitcherOpen}
                onOpenChange={setCategorySwitcherOpen}
                selectedIds={[...selectedIdsSet]}
            />
        </KeyboardShortcutsContext.Provider>
    );
}

// =============================================
// HELP MODAL
// =============================================

interface KeyboardShortcutsHelpProps {
    open: boolean;
    onClose: () => void;
}

export function KeyboardShortcutsHelp({ open, onClose }: KeyboardShortcutsHelpProps) {
    const { t, language } = useLanguage();
    const isRTL = language === "ar";

    // Close on Escape
    useEffect(() => {
        if (!open) return;
        function handleKey(e: KeyboardEvent) {
            if (e.key === "Escape") {
                e.preventDefault();
                onClose();
            }
        }
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [open, onClose]);

    const grouped = Object.entries(CATEGORIES).map(([key, meta]) => ({
        key,
        label: isRTL ? meta.labelAr : meta.label,
        shortcuts: SHORTCUT_DEFS.filter((s) => s.category === key),
    }));

    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        key="backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    {/* Modal */}
                    <motion.div
                        key="modal"
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className={cn(
                            "fixed z-[101] inset-0 flex items-center justify-center p-4",
                            isRTL && "rtl"
                        )}
                    >
                        <div
                            className={cn(
                                "bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl",
                                "w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
                            )}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)]">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-xl bg-blue-500/10">
                                        <Keyboard className="w-5 h-5 text-blue-500" />
                                    </div>
                                    <h2 className="text-lg font-semibold text-foreground">
                                        {t("products.shortcuts.title") || "Keyboard Shortcuts"}
                                    </h2>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-xl hover:bg-[var(--card-border)] transition-colors"
                                    aria-label="Close"
                                >
                                    <X className="w-5 h-5 text-muted" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                                {grouped.map((group) => (
                                    <div key={group.key}>
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
                                            {group.label}
                                        </h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {group.shortcuts.map((shortcut, idx) => (
                                                <div
                                                    key={idx}
                                                    className={cn(
                                                        "flex items-center gap-3 px-3 py-2.5 rounded-xl",
                                                        "bg-[var(--background)] border border-[var(--card-border)]",
                                                        "hover:border-blue-500/30 transition-colors"
                                                    )}
                                                >
                                                    <span className="text-muted flex-shrink-0">
                                                        {shortcut.icon}
                                                    </span>
                                                    <span className="flex-1 text-sm text-foreground">
                                                        {isRTL ? shortcut.labelAr : shortcut.label}
                                                    </span>
                                                    <div className="flex items-center gap-1 flex-shrink-0">
                                                        {shortcut.keys.map((key, ki) => (
                                                            <React.Fragment key={ki}>
                                                                {ki > 0 && (
                                                                    <span className="text-xs text-muted mx-0.5">
                                                                        /
                                                                    </span>
                                                                )}
                                                                <kbd
                                                                    className={cn(
                                                                        "inline-flex items-center justify-center min-w-[24px] h-6 px-1.5",
                                                                        "text-xs font-mono font-medium rounded-md",
                                                                        "bg-[var(--card-bg)] border border-[var(--card-border)]",
                                                                        "shadow-[0_1px_0_1px_var(--card-border)] text-muted"
                                                                    )}
                                                                >
                                                                    {key}
                                                                </kbd>
                                                            </React.Fragment>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Footer */}
                            <div className="px-6 py-3 border-t border-[var(--card-border)] flex items-center justify-between">
                                <span className="text-xs text-muted">
                                    {t("products.shortcuts.hint") ||
                                        "Press ? anywhere to toggle this dialog"}
                                </span>
                                <div className="flex items-center gap-1">
                                    <kbd className="inline-flex items-center justify-center min-w-[24px] h-5 px-1 text-[10px] font-mono rounded bg-[var(--card-bg)] border border-[var(--card-border)] shadow-[0_1px_0_1px_var(--card-border)] text-muted">
                                        Esc
                                    </kbd>
                                    <span className="text-xs text-muted ml-1">
                                        {t("products.shortcuts.close") || "to close"}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

export default KeyboardShortcutsProvider;
