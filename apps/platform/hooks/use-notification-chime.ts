// apps/platform/hooks/use-notification-chime.ts
//
// Plays the sound the notification settings have been promising. The decision
// of whether to play lives in `lib/notification-chime.ts`; this is only the
// audio element and the rate limit.

import { useCallback, useRef } from "react";
import { useNotificationSettings } from "@/hooks/use-notification-settings";
import { chimeUrlFor, minutesOfDay, shouldChime } from "@/lib/notification-chime";

/**
 * A bulk status change writes dozens of rows a second. One sound per burst is
 * information; forty is an alarm clock.
 */
const MIN_GAP_MS = 1_500;

export interface ChimeRequest {
    category: string;
    priority: string;
    isOwnAction: boolean;
}

export function useNotificationChime(): (request: ChimeRequest) => void {
    const { prefs, quietHours } = useNotificationSettings();
    const lastPlayedAt = useRef(0);
    const elements = useRef<Map<string, HTMLAudioElement>>(new Map());

    return useCallback(
        (request: ChimeRequest) => {
            if (typeof window === "undefined") return;

            if (!shouldChime({
                category: request.category,
                priority: request.priority,
                isOwnAction: request.isOwnAction,
                prefs,
                quietHours,
                nowMinutes: minutesOfDay(new Date()),
            })) return;

            const now = Date.now();
            if (now - lastPlayedAt.current < MIN_GAP_MS) return;
            lastPlayedAt.current = now;

            const url = chimeUrlFor(request.priority);
            try {
                let element = elements.current.get(url);
                if (!element) {
                    element = new Audio(url);
                    element.preload = "auto";
                    elements.current.set(url, element);
                }
                element.currentTime = 0;
                // Browsers refuse audio until the tab has been interacted with.
                // That rejection is the normal first-load case, not a fault.
                void element.play().catch(() => {});
            } catch {
                // No Audio constructor (jsdom, locked-down embed) — stay quiet.
            }
        },
        [prefs, quietHours],
    );
}
