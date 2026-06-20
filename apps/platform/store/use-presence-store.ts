import { create } from "zustand";
import type { PresenceStatus } from "@/hooks/chat/use-tenant-presence";

interface PresenceState {
    statuses: Record<string, PresenceStatus>;
    setStatuses: (next: Record<string, PresenceStatus>) => void;
}

/** Live online status by user id. WRITTEN by the single tenant-presence subscription
 *  (LivePresenceStack via useTenantPresence) and READ by avatar consumers — no consumer
 *  here opens a realtime channel, so the single-subscription invariant holds. */
export const usePresenceStore = create<PresenceState>((set) => ({
    statuses: {},
    setStatuses: (next) => set({ statuses: next }),
}));

/** Read one user's live status without subscribing to realtime. Absent → "offline". */
export function usePresenceStatus(userId: string | null | undefined): PresenceStatus | "offline" {
    return usePresenceStore((s) => (userId ? s.statuses[userId] : undefined) ?? "offline");
}
