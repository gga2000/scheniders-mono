import { describe, it, expect } from "vitest";
import { parseVideoUrl, videoEmbedSrc, videoPosterUrl } from "./video-embed";

describe("parseVideoUrl — YouTube", () => {
    it.each([
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtube.com/watch?v=dQw4w9WgXcQ&t=42",
        "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtu.be/dQw4w9WgXcQ",
        "https://youtu.be/dQw4w9WgXcQ?t=10",
        "https://www.youtube.com/embed/dQw4w9WgXcQ",
        "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
        "https://www.youtube.com/shorts/dQw4w9WgXcQ",
        "https://www.youtube.com/live/dQw4w9WgXcQ",
        "https://www.youtube.com/v/dQw4w9WgXcQ",
        "youtube.com/watch?v=dQw4w9WgXcQ",
        "  https://youtu.be/dQw4w9WgXcQ  ",
    ])("accepts %s", (url) => {
        expect(parseVideoUrl(url)).toMatchObject({
            provider: "youtube",
            id: "dQw4w9WgXcQ",
        });
    });

    it("refuses a `?v=` on a host that is not YouTube", () => {
        // The old regex-over-the-raw-string parser matched this.
        expect(parseVideoUrl("https://example.com/page?v=dQw4w9WgXcQ")).toBeNull();
    });

    it("refuses an id that is not 11 characters", () => {
        expect(parseVideoUrl("https://youtu.be/short")).toBeNull();
    });

    it("refuses a channel page and a bare playlist", () => {
        expect(parseVideoUrl("https://www.youtube.com/@kawkabbrand")).toBeNull();
        expect(
            parseVideoUrl("https://www.youtube.com/playlist?list=PLabcdefghijk"),
        ).toBeNull();
    });
});

describe("parseVideoUrl — Vimeo", () => {
    it("accepts a plain share link", () => {
        expect(parseVideoUrl("https://vimeo.com/123456789")).toMatchObject({
            provider: "vimeo",
            id: "123456789",
        });
    });

    it("keeps the unlisted hash from the share link path", () => {
        expect(parseVideoUrl("https://vimeo.com/123456789/a1b2c3d4")).toMatchObject({
            provider: "vimeo",
            id: "123456789",
            hash: "a1b2c3d4",
        });
    });

    it("keeps the unlisted hash from the player query", () => {
        expect(
            parseVideoUrl("https://player.vimeo.com/video/123456789?h=a1b2c3d4"),
        ).toMatchObject({ id: "123456789", hash: "a1b2c3d4" });
    });

    it("finds the id inside a channel path", () => {
        expect(parseVideoUrl("https://vimeo.com/channels/staffpicks/123456789"))
            .toMatchObject({ provider: "vimeo", id: "123456789" });
    });
});

describe("parseVideoUrl — direct files", () => {
    it.each(["mp4", "m4v", "webm", "ogv", "mov"])("accepts .%s", (ext) => {
        const url = `https://cdn.example.com/clip.${ext}`;
        expect(parseVideoUrl(url)).toMatchObject({ provider: "file", src: url });
    });

    it("accepts a file behind a query string", () => {
        expect(
            parseVideoUrl("https://cdn.example.com/clip.mp4?token=abc"),
        ).toMatchObject({ provider: "file" });
    });
});

describe("parseVideoUrl — refusals", () => {
    it.each([
        ["empty", ""],
        ["whitespace", "   "],
        ["a bare id", "dQw4w9WgXcQ"],
        ["prose", "ask me for the link"],
        ["a page with no video", "https://example.com/about"],
        ["a provider with no public embed", "https://www.tiktok.com/@brand/video/7123456789"],
        ["an image", "https://cdn.example.com/photo.jpg"],
        ["a non-http scheme", "javascript:alert(1)"],
    ])("returns null for %s", (_label, url) => {
        expect(parseVideoUrl(url)).toBeNull();
    });

    it("never guesses that an unknown link is a playable file", () => {
        // The whole point: a black <video> box on a shopper's page is worse
        // than the section rendering nothing at all.
        const parsed = parseVideoUrl("https://www.instagram.com/reel/Cabcdefghij/");
        expect(parsed).toBeNull();
    });
});

describe("videoEmbedSrc", () => {
    const yt = parseVideoUrl("https://youtu.be/dQw4w9WgXcQ")!;
    const vm = parseVideoUrl("https://vimeo.com/123456789/a1b2c3d4")!;

    it("uses the no-cookie YouTube host", () => {
        expect(videoEmbedSrc(yt)).toContain("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    });

    it("mutes YouTube with `mute`, not Vimeo's `muted`", () => {
        const src = videoEmbedSrc(yt, { autoplay: true });
        expect(src).toContain("mute=1");
        expect(src).not.toContain("muted=1");
    });

    it("mutes Vimeo with `muted`", () => {
        const src = videoEmbedSrc(vm, { autoplay: true });
        expect(src).toContain("muted=1");
    });

    it("forces mute whenever autoplay is asked for", () => {
        // An unmuted autoplay is blocked by every browser, so the request
        // would produce a dead frame instead of a playing video.
        expect(videoEmbedSrc(yt, { autoplay: true, muted: false })).toContain("mute=1");
        expect(videoEmbedSrc(vm, { autoplay: true, muted: false })).toContain("muted=1");
    });

    it("does not mute a click-to-play embed", () => {
        expect(videoEmbedSrc(yt)).not.toContain("mute=1");
    });

    it("loops YouTube by naming the video as its own playlist", () => {
        const src = videoEmbedSrc(yt, { loop: true });
        expect(src).toContain("loop=1");
        expect(src).toContain("playlist=dQw4w9WgXcQ");
    });

    it("carries the Vimeo unlisted hash into the player URL", () => {
        expect(videoEmbedSrc(vm)).toContain("h=a1b2c3d4");
    });

    it("returns the file URL untouched for a direct file", () => {
        const file = parseVideoUrl("https://cdn.example.com/clip.mp4")!;
        expect(videoEmbedSrc(file, { autoplay: true })).toBe(
            "https://cdn.example.com/clip.mp4",
        );
    });
});

describe("videoPosterUrl", () => {
    it("serves a YouTube thumbnail that always exists", () => {
        const yt = parseVideoUrl("https://youtu.be/dQw4w9WgXcQ")!;
        // `maxresdefault` 404s for anything never uploaded above 720p.
        expect(videoPosterUrl(yt)).toBe(
            "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        );
    });

    it("has no thumbnail for Vimeo or a file", () => {
        expect(videoPosterUrl(parseVideoUrl("https://vimeo.com/123456789")!)).toBeNull();
        expect(
            videoPosterUrl(parseVideoUrl("https://cdn.example.com/clip.mp4")!),
        ).toBeNull();
    });
});
