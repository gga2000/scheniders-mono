/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { VoiceMicButton } from "./voice-mic-button";

const toastError = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));

/** Stands in for the browser's speech service; the test plays its events. */
class FakeSpeech {
    static last: FakeSpeech | null = null;
    lang = "";
    continuous = true;
    interimResults = false;
    maxAlternatives = 0;
    onresult: ((event: { results: SpeechRecognitionResultList }) => void) | null = null;
    onerror: ((event: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    start = vi.fn();
    stop = vi.fn(() => this.onend?.());
    abort = vi.fn();
    constructor() {
        FakeSpeech.last = this;
    }
    hear(...pieces: [string, boolean][]) {
        const results = pieces.map(([transcript, isFinal]) => ({ 0: { transcript, confidence: 1 }, isFinal, length: 1 }));
        this.onresult?.({ results: results as unknown as SpeechRecognitionResultList });
    }
}

type SpeechWindow = Window & { webkitSpeechRecognition?: typeof FakeSpeech };

function Box({ initial = "", maxLength, onChange }: { initial?: string; maxLength?: number; onChange: (v: string) => void }) {
    return <VoiceMicButton value={initial} onValueChange={onChange} maxLength={maxLength} />;
}

beforeEach(() => {
    FakeSpeech.last = null;
    (window as SpeechWindow).webkitSpeechRecognition = FakeSpeech;
});

afterEach(() => {
    cleanup();
    delete (window as SpeechWindow).webkitSpeechRecognition;
    toastError.mockReset();
});

describe("VoiceMicButton", () => {
    it("hides where the browser cannot listen", () => {
        delete (window as SpeechWindow).webkitSpeechRecognition;
        render(<Box onChange={vi.fn()} />);
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("listens in Iraqi Arabic, one phrase per press, with live guesses", () => {
        render(<Box onChange={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "voice.start" }));
        const speech = FakeSpeech.last;
        expect(speech?.start).toHaveBeenCalledTimes(1);
        expect(speech?.lang).toBe("ar-IQ");
        expect(speech?.continuous).toBe(false);
        expect(speech?.interimResults).toBe(true);
        expect(screen.getByRole("button", { name: "voice.stop" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("writes words into the box while talking, after what was typed", () => {
        const onChange = vi.fn();
        render(<Box initial="الكرادة" onChange={onChange} />);
        fireEvent.click(screen.getByRole("button"));
        act(() => FakeSpeech.last?.hear(["قرب", false]));
        expect(onChange).toHaveBeenLastCalledWith("الكرادة قرب");
        act(() => FakeSpeech.last?.hear(["قرب جامع الأورفلي", true]));
        expect(onChange).toHaveBeenLastCalledWith("الكرادة قرب جامع الأورفلي");
    });

    it("keeps to the box's limit", () => {
        const onChange = vi.fn();
        render(<Box initial="abc" maxLength={6} onChange={onChange} />);
        fireEvent.click(screen.getByRole("button"));
        act(() => FakeSpeech.last?.hear(["defgh", true]));
        expect(onChange).toHaveBeenLastCalledWith("abc de");
    });

    it("stops on the second press and goes back to the mic", () => {
        render(<Box onChange={vi.fn()} />);
        fireEvent.click(screen.getByRole("button"));
        const speech = FakeSpeech.last;
        fireEvent.click(screen.getByRole("button", { name: "voice.stop" }));
        expect(speech?.stop).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("button", { name: "voice.start" })).toBeTruthy();
    });

    it("goes back to the mic when the service ends on a pause", () => {
        render(<Box onChange={vi.fn()} />);
        fireEvent.click(screen.getByRole("button"));
        act(() => FakeSpeech.last?.onend?.());
        expect(screen.getByRole("button", { name: "voice.start" })).toBeTruthy();
    });

    it("says what went wrong when the mic is blocked", () => {
        render(<Box onChange={vi.fn()} />);
        fireEvent.click(screen.getByRole("button"));
        act(() => FakeSpeech.last?.onerror?.({ error: "not-allowed" }));
        expect(toastError).toHaveBeenCalledWith("voice.blocked");
    });

    it("stays quiet when the mic was stopped on purpose", () => {
        render(<Box onChange={vi.fn()} />);
        fireEvent.click(screen.getByRole("button"));
        act(() => FakeSpeech.last?.onerror?.({ error: "aborted" }));
        expect(toastError).not.toHaveBeenCalled();
    });

    it("lets go of the mic when the box goes away", () => {
        const { unmount } = render(<Box onChange={vi.fn()} />);
        fireEvent.click(screen.getByRole("button"));
        const speech = FakeSpeech.last;
        unmount();
        expect(speech?.abort).toHaveBeenCalledTimes(1);
    });
});
