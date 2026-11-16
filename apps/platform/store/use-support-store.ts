import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

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

interface SupportNoticeSeenState {
    /** The last support notice this browser showed in the open chat. */
    seenNoticeId: string | null;
    markNoticeSeen: (id: string) => void;
}

/**
 * Which support notice this browser has already shown, so the Help button can
 * mark a new one until the merchant opens the chat. A browser that cannot keep
 * it just shows the mark again; nothing else depends on it.
 */
export const useSupportNoticeSeen = create<SupportNoticeSeenState>()(
    persist(
        (set) => ({
            seenNoticeId: null,
            markNoticeSeen: (id) => set({ seenNoticeId: id }),
        }),
        { name: "support-notice-seen", storage: createJSONStorage(() => localStorage) },
    ),
);

/** A live notice the merchant has not seen in the chat yet. */
export function hasNewNotice(noticeId: string | null | undefined, seenNoticeId: string | null): boolean {
    return Boolean(noticeId) && noticeId !== seenNoticeId;
}
