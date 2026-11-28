import { describe, expect, it } from "vitest";
import { appendSpoken, heardText, speechFailure } from "./speech-text";

describe("speechFailure", () => {
    it("tells the merchant what they can fix", () => {
        expect(speechFailure("not-allowed")).toBe("blocked");
        expect(speechFailure("service-not-allowed")).toBe("blocked");
        expect(speechFailure("audio-capture")).toBe("no-mic");
        expect(speechFailure("no-speech")).toBe("no-speech");
        expect(speechFailure("network")).toBe("offline");
        expect(speechFailure("language-not-supported")).toBe("failed");
    });

    it("stays quiet when we stopped the mic ourselves", () => {
        expect(speechFailure("aborted")).toBeNull();
    });
});

describe("heardText", () => {
    it("joins sure words and guesses into one line", () => {
        expect(heardText([
            { transcript: "الكرادة داخل ", isFinal: true },
            { transcript: " قرب جامع", isFinal: false },
        ])).toBe("الكرادة داخل قرب جامع");
    });

    it("skips empty pieces", () => {
        expect(heardText([{ transcript: "  ", isFinal: false }, { transcript: "بغداد", isFinal: true }])).toBe("بغداد");
        expect(heardText([])).toBe("");
    });
});

describe("appendSpoken", () => {
    it("fills an empty box", () => {
        expect(appendSpoken("", " حيدر كاظم ")).toBe("حيدر كاظم");
        expect(appendSpoken("   ", "حيدر")).toBe("حيدر");
    });

    it("adds after what is typed with one space", () => {
        expect(appendSpoken("الكرادة", "قرب الجامع")).toBe("الكرادة قرب الجامع");
        expect(appendSpoken("الكرادة ", "قرب الجامع")).toBe("الكرادة قرب الجامع");
        expect(appendSpoken("سطر\n", "ثاني")).toBe("سطر\nثاني");
    });

    it("leaves the box alone when nothing was heard", () => {
        expect(appendSpoken("الكرادة", "  ")).toBe("الكرادة");
    });

    it("never goes past the box's limit", () => {
        expect(appendSpoken("abc", "defgh", 6)).toBe("abc de");
        expect(appendSpoken("", "defgh", 3)).toBe("def");
    });
});
