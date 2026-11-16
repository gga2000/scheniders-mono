import { create } from "zustand";

/** The error message the merchant pressed "contact support" on. */
export interface SupportErrorPrefill {
    /** The message's i18n key, so staff know exactly which screen said it. */
    errorCode: string;
    /** The words the merchant saw. */
    errorMessage: string;
}

interface SupportUIState {
    isOpen: boolean;
    /** Attached to the next message; cleared once it is sent or the chat closes. */
    errorPrefill: SupportErrorPrefill | null;
    open: (errorPrefill?: SupportErrorPrefill) => void;
    close: () => void;
    clearErrorPrefill: () => void;
}

export const useSupportStore = create<SupportUIState>()((set) => ({
    isOpen: false,
    errorPrefill: null,
    open: (errorPrefill) => set({ isOpen: true, errorPrefill: errorPrefill ?? null }),
    close: () => set({ isOpen: false, errorPrefill: null }),
    clearErrorPrefill: () => set({ errorPrefill: null }),
}));
