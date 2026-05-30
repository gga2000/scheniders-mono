"use client";

import { useEffect } from "react";

export interface QCKeyboardShortcutsProps {
    enabled: boolean;
    itemCount: number;
    selectedCount: number;
    onFocusSearch: () => void;
    onMoveFocus: (delta: 1 | -1) => void;
    onToggleSelectFocused: () => void;
    onClearSelection: () => void;
    onBulkRestock: () => void;
    onBulkWriteOff: () => void;
    onBulkReturn: () => void;
    onToggleHelp: () => void;
}

/**
 * isTypingTarget — true when the user is typing into an editable element.
 * We never fire shortcuts while typing, so `/` doesn't trigger when a user is
 * already inside the search box, `R` doesn't eat characters from a notes field,
 * etc. Checks tagName + contenteditable + role="textbox".
 */
function isTypingTarget(el: Element | null): boolean {
    if (!el) return false;
    const tag = (el as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    const html = el as HTMLElement;
    if (html.isContentEditable) return true;
    if (html.getAttribute?.("role") === "textbox") return true;
    return false;
}

/**
 * Headless keyboard-shortcut binder for the QC workspace. Renders nothing —
 * just wires a single `keydown` listener on window while `enabled` is true.
 */
export function QCKeyboardShortcuts(props: QCKeyboardShortcutsProps) {
    const {
        enabled,
        itemCount,
        selectedCount,
        onFocusSearch,
        onMoveFocus,
        onToggleSelectFocused,
        onClearSelection,
        onBulkRestock,
        onBulkWriteOff,
        onBulkReturn,
        onToggleHelp,
    } = props;

    useEffect(() => {
        if (!enabled) return;

        const handler = (e: KeyboardEvent) => {
            // Ignore modifier combos (except plain Shift for `?`). This leaves
            // Ctrl/Meta/Alt combos to the browser and OS.
            if (e.ctrlKey || e.metaKey || e.altKey) return;

            const key = e.key;

            // Help toggle: Shift+/ produces "?" on most layouts. Handled before
            // the typing-target guard so users can surface help from anywhere,
            // including while the search box is focused.
            if (key === "?") {
                e.preventDefault();
                onToggleHelp();
                return;
            }

            // Ignore while typing in an input/textarea/contenteditable.
            if (isTypingTarget(document.activeElement)) return;

            // `/` — focus search
            if (key === "/") {
                e.preventDefault();
                onFocusSearch();
                return;
            }

            // Escape — clear selection (only if there is one).
            if (key === "Escape") {
                if (selectedCount > 0) {
                    e.preventDefault();
                    onClearSelection();
                }
                return;
            }

            // Arrow navigation.
            if (key === "ArrowDown") {
                if (itemCount > 0) {
                    e.preventDefault();
                    onMoveFocus(1);
                }
                return;
            }
            if (key === "ArrowUp") {
                if (itemCount > 0) {
                    e.preventDefault();
                    onMoveFocus(-1);
                }
                return;
            }

            // Letter shortcuts. Normalize to lowercase so Shift+letter still matches
            // (except `?` which we handled above).
            const lower = key.toLowerCase();

            if (lower === "j") {
                if (itemCount > 0) {
                    e.preventDefault();
                    onMoveFocus(1);
                }
                return;
            }
            if (lower === "k") {
                if (itemCount > 0) {
                    e.preventDefault();
                    onMoveFocus(-1);
                }
                return;
            }
            if (lower === "x") {
                if (itemCount > 0) {
                    e.preventDefault();
                    onToggleSelectFocused();
                }
                return;
            }
            if (lower === "r") {
                if (selectedCount > 0) {
                    e.preventDefault();
                    onBulkRestock();
                }
                return;
            }
            if (lower === "w") {
                if (selectedCount > 0) {
                    e.preventDefault();
                    onBulkWriteOff();
                }
                return;
            }
            if (lower === "e") {
                if (selectedCount > 0) {
                    e.preventDefault();
                    onBulkReturn();
                }
                return;
            }
        };

        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [
        enabled,
        itemCount,
        selectedCount,
        onFocusSearch,
        onMoveFocus,
        onToggleSelectFocused,
        onClearSelection,
        onBulkRestock,
        onBulkWriteOff,
        onBulkReturn,
        onToggleHelp,
    ]);

    return null;
}
