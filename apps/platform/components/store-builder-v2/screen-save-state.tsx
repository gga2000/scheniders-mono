"use client";

// =====================================================================
// Screen save state — lets every settings screen header show a failed
// autosave right under its title, where the merchant just made the edit.
// The edit itself is kept: the builder keeps retrying the latest draft,
// and the strip disappears on its own once a save lands.
// =====================================================================

import { createContext, useContext } from "react";

export interface ScreenSaveState {
    failed: boolean;
    retry: () => void;
}

const ScreenSaveStateContext = createContext<ScreenSaveState | null>(null);

export const ScreenSaveStateProvider = ScreenSaveStateContext.Provider;

/** Null outside the editor's settings router (tests, embedded screens). */
export function useScreenSaveState(): ScreenSaveState | null {
    return useContext(ScreenSaveStateContext);
}
