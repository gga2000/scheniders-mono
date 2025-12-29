"use client";

import { useEffect, useCallback, useState } from "react";

// =============================================
// TYPES
// =============================================

export interface KeyboardShortcut {
    key: string;
    label: string;
    labelAr: string;
    description?: string;
    descriptionAr?: string;
    action: () => void;
    // Modifiers
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    meta?: boolean;
    // Visibility
    global?: boolean; // Works anywhere on page
    category?: "navigation" | "orders" | "actions" | "general";
}

export interface ShortcutOptions {
    enabled?: boolean;
    preventDefault?: boolean;
}

// =============================================
// DEFAULT SHORTCUTS CONFIG
// =============================================

export const DEFAULT_SHORTCUT_CATEGORIES = {
    navigation: { label: "Navigation", labelAr: "التنقل" },
    orders: { label: "Orders", labelAr: "الطلبات" },
    actions: { label: "Actions", labelAr: "الإجراءات" },
    general: { label: "General", labelAr: "عام" },
};

// =============================================
// HOOK: Use Keyboard Shortcuts
// =============================================

export function useKeyboardShortcuts(
    shortcuts: KeyboardShortcut[],
    options: ShortcutOptions = {}
) {
    const { enabled = true, preventDefault = true } = options;
    const [activeShortcuts, setActiveShortcuts] = useState<KeyboardShortcut[]>(shortcuts);

    // Update shortcuts when they change
    useEffect(() => {
        setActiveShortcuts(shortcuts);
    }, [shortcuts]);

    const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
            if (!enabled) return;

            // Don't trigger shortcuts when typing in inputs
            const target = event.target as HTMLElement;
            if (
                target.tagName === "INPUT" ||
                target.tagName === "TEXTAREA" ||
                target.tagName === "SELECT" ||
                target.isContentEditable
            ) {
                // Allow Escape to work even in inputs
                if (event.key !== "Escape") return;
            }

            // Find matching shortcut
            const matchingShortcut = activeShortcuts.find((shortcut) => {
                const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
                const ctrlMatch = !!shortcut.ctrl === (event.ctrlKey || event.metaKey);
                const altMatch = !!shortcut.alt === event.altKey;
                const shiftMatch = !!shortcut.shift === event.shiftKey;

                return keyMatch && ctrlMatch && altMatch && shiftMatch;
            });

            if (matchingShortcut) {
                if (preventDefault) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                matchingShortcut.action();
            }
        },
        [activeShortcuts, enabled, preventDefault]
    );

    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleKeyDown]);

    return {
        shortcuts: activeShortcuts,
        updateShortcuts: setActiveShortcuts,
    };
}

// =============================================
// HOOK: Use Order Shortcuts
// Specific shortcuts for order management
// =============================================

export interface OrderShortcutActions {
    onConfirm?: () => void;
    onReject?: () => void;
    onCancel?: () => void;
    onWhatsApp?: () => void;
    onViewDetails?: () => void;
    onNextOrder?: () => void;
    onPrevOrder?: () => void;
    onPrint?: () => void;
    onSearch?: () => void;
    onNewOrder?: () => void;
    onEscape?: () => void;
    onToggleHelp?: () => void;
}

export function useOrderShortcuts(actions: OrderShortcutActions, enabled = true) {
    const shortcuts: KeyboardShortcut[] = [];

    // Order Actions
    if (actions.onConfirm) {
        shortcuts.push({
            key: "c",
            label: "Confirm",
            labelAr: "تأكيد",
            descriptionAr: "تأكيد الطلب المحدد",
            action: actions.onConfirm,
            category: "orders",
        });
    }

    if (actions.onReject) {
        shortcuts.push({
            key: "r",
            label: "Reject",
            labelAr: "رفض",
            descriptionAr: "رفض الطلب",
            action: actions.onReject,
            category: "orders",
        });
    }

    if (actions.onCancel) {
        shortcuts.push({
            key: "x",
            label: "Cancel",
            labelAr: "إلغاء",
            descriptionAr: "إلغاء الطلب",
            action: actions.onCancel,
            category: "orders",
        });
    }

    if (actions.onWhatsApp) {
        shortcuts.push({
            key: "w",
            label: "WhatsApp",
            labelAr: "واتساب",
            descriptionAr: "فتح محادثة واتساب",
            action: actions.onWhatsApp,
            category: "orders",
        });
    }

    if (actions.onViewDetails) {
        shortcuts.push({
            key: "Enter",
            label: "View Details",
            labelAr: "عرض التفاصيل",
            descriptionAr: "عرض تفاصيل الطلب",
            action: actions.onViewDetails,
            category: "orders",
        });
    }

    // Navigation
    if (actions.onNextOrder) {
        shortcuts.push({
            key: "ArrowDown",
            label: "Next Order",
            labelAr: "الطلب التالي",
            action: actions.onNextOrder,
            category: "navigation",
        });
        shortcuts.push({
            key: "j",
            label: "Next Order",
            labelAr: "الطلب التالي",
            action: actions.onNextOrder,
            category: "navigation",
        });
    }

    if (actions.onPrevOrder) {
        shortcuts.push({
            key: "ArrowUp",
            label: "Previous Order",
            labelAr: "الطلب السابق",
            action: actions.onPrevOrder,
            category: "navigation",
        });
        shortcuts.push({
            key: "k",
            label: "Previous Order",
            labelAr: "الطلب السابق",
            action: actions.onPrevOrder,
            category: "navigation",
        });
    }

    // Actions
    if (actions.onPrint) {
        shortcuts.push({
            key: "p",
            ctrl: true,
            label: "Print",
            labelAr: "طباعة",
            descriptionAr: "طباعة الطلب",
            action: actions.onPrint,
            category: "actions",
        });
    }

    if (actions.onSearch) {
        shortcuts.push({
            key: "/",
            label: "Search",
            labelAr: "بحث",
            descriptionAr: "فتح البحث",
            action: actions.onSearch,
            category: "actions",
            global: true,
        });
        shortcuts.push({
            key: "k",
            ctrl: true,
            label: "Search",
            labelAr: "بحث",
            action: actions.onSearch,
            category: "actions",
            global: true,
        });
    }

    if (actions.onNewOrder) {
        shortcuts.push({
            key: "n",
            label: "New Order",
            labelAr: "طلب جديد",
            descriptionAr: "إنشاء طلب جديد",
            action: actions.onNewOrder,
            category: "actions",
        });
    }

    // General
    if (actions.onEscape) {
        shortcuts.push({
            key: "Escape",
            label: "Close",
            labelAr: "إغلاق",
            descriptionAr: "إغلاق النافذة",
            action: actions.onEscape,
            category: "general",
            global: true,
        });
    }

    if (actions.onToggleHelp) {
        shortcuts.push({
            key: "?",
            label: "Show Shortcuts",
            labelAr: "عرض الاختصارات",
            descriptionAr: "عرض جميع اختصارات لوحة المفاتيح",
            action: actions.onToggleHelp,
            category: "general",
            global: true,
        });
    }

    return useKeyboardShortcuts(shortcuts, { enabled });
}

// =============================================
// HELPER: Format shortcut key for display
// =============================================

export function formatShortcutKey(shortcut: KeyboardShortcut): string {
    const parts: string[] = [];

    if (shortcut.ctrl) parts.push("⌘");
    if (shortcut.alt) parts.push("⌥");
    if (shortcut.shift) parts.push("⇧");

    // Format special keys
    const keyDisplay: Record<string, string> = {
        Enter: "↵",
        ArrowUp: "↑",
        ArrowDown: "↓",
        ArrowLeft: "←",
        ArrowRight: "→",
        Escape: "Esc",
        " ": "Space",
    };

    parts.push(keyDisplay[shortcut.key] || shortcut.key.toUpperCase());

    return parts.join(" + ");
}
