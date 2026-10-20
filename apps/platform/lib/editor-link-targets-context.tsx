"use client";

// =====================================================================
// EditorLinkTargetsContext — link destinations that live in the config
// =====================================================================
// The link picker reaches products and categories through their own
// queries, but the merchant's custom pages exist only in the config being
// edited (config.custom_pages, served at /p/<slug>). EditorShell provides
// them here so every *_href field, however deep in an AutoForm, can offer
// them without each parent threading the config through props.
//
// Outside the provider (unit tests, isolated stories) the list is empty:
// the picker still opens, it just has no custom pages to offer.
// =====================================================================

import { createContext, useContext, type ReactNode } from "react";
import type { CustomPage } from "@scheniders/shared";

const EditorLinkTargetsContext = createContext<readonly CustomPage[]>([]);

export interface EditorLinkTargetsProviderProps {
    customPages: readonly CustomPage[] | undefined;
    children: ReactNode;
}

export function EditorLinkTargetsProvider({ customPages, children }: EditorLinkTargetsProviderProps) {
    return (
        <EditorLinkTargetsContext.Provider value={customPages ?? []}>
            {children}
        </EditorLinkTargetsContext.Provider>
    );
}

/** The merchant's custom pages, as the editor currently holds them. */
export function useEditorCustomPages(): readonly CustomPage[] {
    return useContext(EditorLinkTargetsContext);
}
