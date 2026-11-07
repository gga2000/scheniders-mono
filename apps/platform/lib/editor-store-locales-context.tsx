"use client";

// =====================================================================
// EditorStoreLocalesContext — the languages this store is written in
// =====================================================================
// Text fields offer translations only for the store's own languages
// (default_locale + enabled_locales). An Arabic + English store should
// not be asked for Kurdish on every field.
//
// Outside the provider (unit tests, isolated stories) every supported
// language is offered, which is the old behaviour.
// =====================================================================

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { SUPPORTED_LOCALES, type LocaleCode } from "@scheniders/shared";

const EditorStoreLocalesContext = createContext<readonly LocaleCode[]>(SUPPORTED_LOCALES);

export interface EditorStoreLocalesProviderProps {
    defaultLocale: LocaleCode;
    enabledLocales: readonly LocaleCode[] | undefined;
    children: ReactNode;
}

export function EditorStoreLocalesProvider({
    defaultLocale,
    enabledLocales,
    children,
}: EditorStoreLocalesProviderProps) {
    const locales = useMemo(
        () => SUPPORTED_LOCALES.filter((l) => l === defaultLocale || (enabledLocales ?? []).includes(l)),
        [defaultLocale, enabledLocales],
    );
    return (
        <EditorStoreLocalesContext.Provider value={locales}>{children}</EditorStoreLocalesContext.Provider>
    );
}

/** The store's languages, in the shared supported order. */
export function useEditorStoreLocales(): readonly LocaleCode[] {
    return useContext(EditorStoreLocalesContext);
}
