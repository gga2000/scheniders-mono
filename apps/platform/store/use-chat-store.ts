// apps/platform/store/use-chat-store.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface ChatUIState {
    // ------------------------------------------------------------------
    // Transient UI state
    // ------------------------------------------------------------------
    isOpen: boolean;
    isExpanded: boolean;            // drawer vs full-page (P2 wires the page)
    activeConversationId: string | null;
    settingsConversationId: string | null;
    focusMessageId: string | null;
    /** Id of the message the composer is replying to (quote-reply). Null = no reply. */
    replyToId: string | null;

    // ------------------------------------------------------------------
    // Persisted: per-conversation draft text
    // ------------------------------------------------------------------
    drafts: Record<string, string>;

    // ------------------------------------------------------------------
    // Persisted: notification sound toggle
    // ------------------------------------------------------------------
    soundEnabled: boolean;

    // ------------------------------------------------------------------
    // Actions
    // ------------------------------------------------------------------
    open: (conversationId?: string) => void;
    close: () => void;
    setExpanded: (v: boolean) => void;
    setActiveConversation: (id: string | null) => void;
    openSettings: (id: string) => void;
    closeSettings: () => void;
    openMessage: (conversationId: string, messageId: string) => void;
    clearFocusMessage: () => void;
    setDraft: (conversationId: string, text: string) => void;
    clearDraft: (conversationId: string) => void;
    setReplyTo: (messageId: string | null) => void;
    setSoundEnabled: (v: boolean) => void;
}

export const useChatStore = create<ChatUIState>()(
    persist(
        (set) => ({
            // ------------------------------------------------------------------
            // Transient defaults
            // ------------------------------------------------------------------
            isOpen: false,
            isExpanded: false,
            activeConversationId: null,
            settingsConversationId: null,
            focusMessageId: null,
            replyToId: null,

            // ------------------------------------------------------------------
            // Persisted defaults
            // ------------------------------------------------------------------
            drafts: {},
            soundEnabled: true,

            // ------------------------------------------------------------------
            // Actions
            // ------------------------------------------------------------------
            open: (conversationId) =>
                set((s) => ({ isOpen: true, activeConversationId: conversationId ?? s.activeConversationId })),
            close: () => set({ isOpen: false }),
            setExpanded: (v) => set({ isExpanded: v }),
            setActiveConversation: (id) => set({ activeConversationId: id }),
            openSettings: (id) => set({ settingsConversationId: id }),
            closeSettings: () => set({ settingsConversationId: null }),
            openMessage: (conversationId, messageId) =>
                set({ isOpen: true, activeConversationId: conversationId, focusMessageId: messageId }),
            clearFocusMessage: () => set({ focusMessageId: null }),
            setDraft: (conversationId, text) =>
                set((s) => ({ drafts: { ...s.drafts, [conversationId]: text } })),
            clearDraft: (conversationId) =>
                set((s) => {
                    const next = { ...s.drafts };
                    delete next[conversationId];
                    return { drafts: next };
                }),
            setReplyTo: (messageId) => set({ replyToId: messageId }),
            setSoundEnabled: (v) => set({ soundEnabled: v }),
        }),
        {
            name: "chat-drafts",
            storage: createJSONStorage(() => localStorage),
            // Persist drafts + sound preference; all UI/navigation state is transient
            partialize: (state) => ({ drafts: state.drafts, soundEnabled: state.soundEnabled }),
        }
    )
);
