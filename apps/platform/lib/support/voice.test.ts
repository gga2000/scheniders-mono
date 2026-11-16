import { describe, expect, it } from "vitest";
import { formatVoiceLength, recorderType, voiceKind } from "./voice";

const head = (...start: number[]) => new Uint8Array([...start, ...new Array(16).fill(0)]);

describe("voiceKind", () => {
    it("knows WebM, Ogg and MP4 by their first bytes", () => {
        expect(voiceKind(head(0x1a, 0x45, 0xdf, 0xa3))?.ext).toBe("webm");
        expect(voiceKind(head(0x4f, 0x67, 0x67, 0x53))?.ext).toBe("ogg");
        expect(voiceKind(head(0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70))).toEqual({ ext: "m4a", contentType: "audio/mp4" });
    });

    it("refuses anything else, and files too short to tell", () => {
        expect(voiceKind(head(0xff, 0xd8, 0xff))).toBeNull();
        expect(voiceKind(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]))).toBeNull();
    });
});

describe("recorderType", () => {
    it("takes WebM/Opus first, then MP4 for iPhone Safari", () => {
        expect(recorderType(() => true)).toBe("audio/webm;codecs=opus");
        expect(recorderType((t) => t === "audio/mp4")).toBe("audio/mp4");
        expect(recorderType(() => false)).toBeNull();
    });
});

describe("formatVoiceLength", () => {
    it("shows minutes and seconds", () => {
        expect(formatVoiceLength(7.8)).toBe("0:07");
        expect(formatVoiceLength(90)).toBe("1:30");
    });
});
