/**
 * Tiny Web Audio chirps for the returns scanner — no asset files, no network.
 *
 * Two cues:
 *  - playScanBeep():  a short pleasant high beep when a scan is accepted.
 *  - playErrorBuzz(): a low two-tone buzz when a scan is rejected (duplicate /
 *                     not found).
 *
 * Browsers start an AudioContext "suspended" until a user gesture, so call
 * primeOnFirstGesture() once when the scanner UI mounts; the first tap/keypress
 * unlocks audio. Every play also tries to resume, so it self-heals.
 */

let ctx: AudioContext | null = null;
let primed = false;

function audioCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    try {
        if (!ctx) {
            const w = window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
            const AC = w.AudioContext ?? w.webkitAudioContext;
            if (!AC) return null;
            ctx = new AC();
        }
        if (ctx.state === "suspended") void ctx.resume();
        return ctx;
    } catch {
        return null;
    }
}

function tone(freq: number, durationMs: number, type: OscillatorType, peak: number, startMs = 0): void {
    const ac = audioCtx();
    if (!ac) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    const start = ac.currentTime + startMs / 1000;
    const end = start + durationMs / 1000;
    osc.frequency.setValueAtTime(freq, start);
    // Quick fade in/out so it clicks softly rather than popping.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain).connect(ac.destination);
    osc.start(start);
    osc.stop(end + 0.02);
}

/** Accepted scan — short bright beep. */
export function playScanBeep(): void {
    tone(880, 90, "sine", 0.2);
}

/** Rejected scan (duplicate / not found) — descending low buzz. */
export function playErrorBuzz(): void {
    tone(320, 130, "square", 0.16, 0);
    tone(180, 200, "square", 0.16, 120);
}

/** Unlock audio on the first user gesture (browsers require one). Idempotent. */
export function primeOnFirstGesture(): void {
    if (primed || typeof window === "undefined") return;
    const unlock = () => {
        primed = true;
        audioCtx();
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
}
