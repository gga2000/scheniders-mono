"use client";

// =====================================================================
// EditorLocaleContext — feeds the builder's active_locale into chrome
// =====================================================================
// Lightweight context so deep chrome components (page-tree, section
// list, settings screens) can read the active editor locale without
// every parent threading it through props.
//
// Editor-shell is expected to wrap its return in
// `<EditorLocaleProvider value={builder.active_locale}>…</EditorLocaleProvider>`
// (TODO Phase 2 — currently the shell is owned by a parallel agent so
// wiring lands separately). Until that wiring exists, `useEditorLocale()`
// defaults to `"en"` and chrome renders in English. Any consumer that
// receives an explicit `activeLocale` prop should pass it through.
// =====================================================================

import { createContext, useContext, type ReactNode } from "react";
import type { LocaleCode } from "@scheniders/shared";

const EditorLocaleContext = createContext<LocaleCode>("en");

export interface EditorLocaleProviderProps {
    value: LocaleCode;
    children: ReactNode;
}

export function EditorLocaleProvider({
    value,
    children,
}: EditorLocaleProviderProps) {
    return (
        <EditorLocaleContext.Provider value={value}>
            {children}
        </EditorLocaleContext.Provider>
    );
}

/** Read the active editor locale. Defaults to `"en"` when no provider mounted. */
export function useEditorLocale(): LocaleCode {
    return useContext(EditorLocaleContext);
}

/**
 * Helper for chrome components that ALSO receive an explicit
 * `activeLocale` prop (e.g. section-list-panel). If a prop is provided,
 * use it; otherwise fall back to the context.
 */
export function useResolvedEditorLocale(override?: LocaleCode): LocaleCode {
    const ctx = useContext(EditorLocaleContext);
    return override ?? ctx;
}
