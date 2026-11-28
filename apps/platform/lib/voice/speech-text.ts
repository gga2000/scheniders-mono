/**
 * Voice typing: the merchant talks, the browser's own speech service writes
 * it down (Chrome, Edge, Samsung Internet, Safari). Free to us, no key and no
 * server. These helpers are the pure parts, kept apart so they can be tested.
 */

/** Speech languages the service gets, by app language. */
export const SPEECH_LANG = { ar: "ar-IQ", en: "en-US" } as const;

/** Why listening stopped early, as the merchant needs to hear it. */
export type SpeechFailure = "blocked" | "no-mic" | "no-speech" | "offline" | "failed";

/**
 * The service's error codes (Web Speech API `SpeechRecognitionErrorEvent.error`)
 * mapped to what the merchant can do about them. `aborted` is ours: we stop
 * the service when the field goes away, which is not a failure.
 */
export function speechFailure(code: string): SpeechFailure | null {
    switch (code) {
        case "aborted":
            return null;
        case "not-allowed":
        case "service-not-allowed":
            return "blocked";
        case "audio-capture":
            return "no-mic";
        case "no-speech":
            return "no-speech";
        case "network":
            return "offline";
        default:
            return "failed";
    }
}

/** One piece of what the service heard; `isFinal` once it stops guessing. */
export interface HeardPiece {
    transcript: string;
    isFinal: boolean;
}

/** Everything heard so far, as one line. */
export function heardText(pieces: readonly HeardPiece[]): string {
    return pieces
        .map((piece) => piece.transcript.trim())
        .filter((text) => text.length > 0)
        .join(" ");
}

/**
 * What was typed plus what was said. Talking never wipes the box: the words
 * go after what is there, with one space between, cut to the box's limit.
 */
export function appendSpoken(typed: string, spoken: string, maxLength?: number): string {
    const words = spoken.trim();
    const joined = words.length === 0
        ? typed
        : typed.trim().length === 0
            ? words
            : `${typed}${/\s$/.test(typed) ? "" : " "}${words}`;
    return maxLength === undefined ? joined : joined.slice(0, maxLength);
}
