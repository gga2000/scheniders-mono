// apps/platform/store/use-chat-store.ts
import { create } from "zustand";

interface ChatUIState {
    isOpen: boolean;
    isExpanded: boolean;            // drawer vs full-page (P2 wires the page)
    activeConversationId: string | null;
    settingsConversationId: string | null;
    focusMessageId: string | null;
    open: (conversationId?: string) => void;
    close: () => void;
    setExpanded: (v: boolean) => void;
    setActiveConversation: (id: string | null) => void;
    openSettings: (id: string) => void;
    closeSettings: () => void;
    openMessage: (conversationId: string, messageId: string) => void;
    clearFocusMessage: () => void;
}

export const useChatStore = create<ChatUIState>((set) => ({
    isOpen: false,
    isExpanded: false,
    activeConversationId: null,
    settingsConversationId: null,
    focusMessageId: null,
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
}));
