// apps/platform/hooks/chat/use-notification-sound.ts
import { useCallback, useRef } from "react";

/**
 * Returns a `playChime()` function that plays a short, gentle Web Audio beep
 * (~120 ms) using the Web Audio API — no audio asset required.
 * Debounced to at most once per second to avoid a burst of sounds.
 * SSR-safe: no-ops when called outside the browser.
 */
export function useNotificationSound(): { playChime: () => void } {
    const lastPlayedAt = useRef<number>(0);

    const playChime = useCallback(() => {
        if (typeof window === "undefined") return;
        // Debounce: ignore if fired within the last 1000 ms
        const now = Date.now();
        if (now - lastPlayedAt.current < 1000) return;
        lastPlayedAt.current = now;

        // Some browsers block AudioContext creation until user interaction;
        // swallow the error silently rather than crashing.
        try {
            const ctx = new AudioContext();
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();

            oscillator.connect(gain);
            gain.connect(ctx.destination);

            // Gentle high-pitched ping: 880 Hz sine wave
            oscillator.type = "sine";
            oscillator.frequency.setValueAtTime(880, ctx.currentTime);

            // Fade in then out over ~120 ms
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);

            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.12);
            oscillator.onended = () => { void ctx.close(); };
        } catch {
            // AudioContext unavailable or blocked — silently skip
        }
    }, []);

    return { playChime };
}
