// apps/platform/hooks/chat/use-notification-sound.ts
import { useCallback, useRef } from "react";
import { SOUND_URLS } from "@/lib/notification-chime";

/**
 * Returns a `playChime()` function that plays the customer-message sound.
 * Debounced to at most once per second to avoid a burst of sounds.
 * SSR-safe: no-ops when called outside the browser.
 */
export function useNotificationSound(): { playChime: () => void } {
    const lastPlayedAt = useRef<number>(0);
    const element = useRef<HTMLAudioElement | null>(null);

    const playChime = useCallback(() => {
        if (typeof window === "undefined") return;
        const now = Date.now();
        if (now - lastPlayedAt.current < 1000) return;
        lastPlayedAt.current = now;

        try {
            element.current ??= new Audio(SOUND_URLS.message);
            element.current.currentTime = 0;
            // Browsers refuse audio until the tab has been interacted with;
            // that rejection is the normal first-load case, not a fault.
            void element.current.play().catch(() => {});
        } catch {
            // No Audio constructor (jsdom, locked-down embed) — stay quiet.
        }
    }, []);

    return { playChime };
}
