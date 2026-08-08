"use client";

import { useEffect, useRef, type ReactElement } from "react";
import {
    Pencil,
    Copy,
    ArrowUp,
    ArrowDown,
    Plus,
    Trash2,
} from "lucide-react";
import { STRINGS, t, type EditorString } from "@/lib/editor-i18n";
import { useResolvedEditorLocale } from "@/lib/editor-locale-context";

export type LivePreviewContextMenuAction =
    | "edit"
    | "duplicate"
    | "up"
    | "down"
    | "add_variant"
    | "delete";

export interface LivePreviewContextMenuProps {
    /** X position in viewport-local coords (px). */
    x: number;
    /** Y position in viewport-local coords (px). */
    y: number;
    onClose: () => void;
    onAction: (action: LivePreviewContextMenuAction) => void;
}

interface MenuItem {
    action: LivePreviewContextMenuAction;
    /** Localized via editor-i18n at render (A3 — canvas chrome). */
    label: EditorString;
    icon: typeof Pencil;
    danger?: boolean;
    testId: string;
}

const ITEMS: MenuItem[] = [
    {
        action: "edit",
        label: STRINGS.section_list.row_edit_label,
        icon: Pencil,
        testId: "live-preview-context-menu-edit",
    },
    {
        action: "duplicate",
        label: STRINGS.section_list.row_duplicate,
        icon: Copy,
        testId: "live-preview-context-menu-duplicate",
    },
    {
        action: "up",
        label: STRINGS.auto_form.move_up,
        icon: ArrowUp,
        testId: "live-preview-context-menu-up",
    },
    {
        action: "down",
        label: STRINGS.auto_form.move_down,
        icon: ArrowDown,
        testId: "live-preview-context-menu-down",
    },
    {
        action: "add_variant",
        label: STRINGS.context_menu.add_variant,
        icon: Plus,
        testId: "live-preview-context-menu-add-variant",
    },
    {
        action: "delete",
        label: STRINGS.section_list.row_delete,
        icon: Trash2,
        danger: true,
        testId: "live-preview-context-menu-delete",
    },
];

export function LivePreviewContextMenu({
    x,
    y,
    onClose,
    onAction,
}: LivePreviewContextMenuProps): ReactElement {
    const locale = useResolvedEditorLocale();
    const ref = useRef<HTMLDivElement | null>(null);

    // Outside click + Escape closes the menu. We use a mount-time flag so
    // the same pointerdown event that opened the menu can't immediately
    // close it.
    useEffect(() => {
        let armed = false;
        const arm = () => {
            armed = true;
        };
        const onPointerDown = (e: MouseEvent) => {
            if (!armed) return;
            const el = ref.current;
            if (!el) return;
            if (e.target instanceof Node && el.contains(e.target)) return;
            onClose();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onClose();
            }
        };
        // Arm on the next macrotask so the open-event finishes first.
        const armTimer = setTimeout(arm, 0);
        window.addEventListener("pointerdown", onPointerDown);
        window.addEventListener("keydown", onKey);
        return () => {
            clearTimeout(armTimer);
            window.removeEventListener("pointerdown", onPointerDown);
            window.removeEventListener("keydown", onKey);
        };
    }, [onClose]);

    return (
        <div
            ref={ref}
            data-testid="live-preview-context-menu"
            role="menu"
            className="pointer-events-auto absolute z-30 min-w-[180px] overflow-hidden rounded-lg border bg-white py-1 shadow-xl"
            style={{
                top: y,
                left: x,
                borderColor: "var(--bk-ink, #1a1a1a)",
                borderWidth: "var(--bk-border-thickness, 2px)",
            }}
        >
            {ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                    <button
                        key={item.action}
                        type="button"
                        role="menuitem"
                        data-testid={item.testId}
                        onClick={() => onAction(item.action)}
                        className={
                            "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors " +
                            (item.danger
                                ? "text-red-600 hover:bg-red-50"
                                : "text-gray-900 hover:bg-gray-100")
                        }
                    >
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{t(item.label, locale)}</span>
                    </button>
                );
            })}
        </div>
    );
}
