"use client";

// =====================================================================
// EditorModeContext — Simple ⇄ Advanced mode for the store builder
// =====================================================================
// The mode is a VIEW preference, never data: it filters which editing
// affordances render (logic fields, per-field translations, breakpoint
// adornments, visibility rules, variants, advanced screens). Anything
// authored in Advanced keeps working on the storefront while hidden in
// Simple — surfaces that hide live data must show a count chip instead
// of nothing (see STRINGS.mode.live_*_chip).
//
// Persistence is PER USER via use-user-preferences
// (PREFERENCE_KEYS.EDITOR_MODE) — an agency freelancer stays in
// Advanced across client stores. EditorShell owns the state and wraps
// the tree in <EditorModeProvider>.
//
// The context default is "advanced" ON PURPOSE: consumers rendered
// outside the provider (unit tests, isolated stories) must never hide
// controls — Simple is opt-in via the provider.
// =====================================================================

import { createContext, useContext, type ReactNode } from "react";

export type EditorMode = "simple" | "advanced";

export interface EditorModeContextValue {
    mode: EditorMode;
    setMode: (next: EditorMode) => void;
}

const EditorModeContext = createContext<EditorModeContextValue>({
    mode: "advanced",
    setMode: () => undefined,
});

export interface EditorModeProviderProps {
    value: EditorModeContextValue;
    children: ReactNode;
}

export function EditorModeProvider({
    value,
    children,
}: EditorModeProviderProps) {
    return (
        <EditorModeContext.Provider value={value}>
            {children}
        </EditorModeContext.Provider>
    );
}

/** Read the current editor mode (+ setter). Defaults to advanced-everything when no provider is mounted. */
export function useEditorMode(): EditorModeContextValue {
    return useContext(EditorModeContext);
}
