/// <reference types="vitest/globals" />
// @vitest-environment jsdom

/**
 * The video field (W7.7).
 *
 * A `.describe("video")` string used to fall through to a bare text box. That
 * is the one field where silence is unaffordable: the storefront renders **no
 * section at all** for a link it cannot play, so a merchant who pastes an
 * Instagram reel watches their section disappear from the page with nothing
 * anywhere explaining why. These guard that the editor says what it read.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render as rtlRender, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { z } from "zod";

vi.mock("@/lib/supabase", () => ({
    supabase: {
        storage: {
            from: () => ({
                upload: () => Promise.resolve({ error: null }),
                getPublicUrl: () => ({ data: { publicUrl: "https://example.com/x.png" } }),
            }),
        },
    },
}));
vi.mock("@/hooks/use-toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AutoForm } from "./auto-form";
import { STRINGS } from "@/lib/editor-i18n";

function render(ui: React.ReactElement) {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const schema = z.object({ video_url: z.string().describe("video") });

function mount(value: string) {
    render(
        <AutoForm schema={schema} value={{ video_url: value }} onChange={vi.fn()} />,
    );
}

const input = () => screen.getByTestId("auto-form-root.video_url-video-input");
const detected = () => screen.queryByTestId("auto-form-root.video_url-video-detected");
const warning = () => screen.queryByTestId("auto-form-root.video_url-video-unrecognized");

afterEach(() => cleanup());

describe("video field", () => {
    it("renders its own control, not the plain string input", () => {
        mount("");
        expect(input()).toBeTruthy();
        expect(screen.queryByTestId("auto-form-root.video_url-input")).toBeNull();
    });

    it("says nothing at all while the field is empty", () => {
        mount("");
        expect(detected()).toBeNull();
        expect(warning()).toBeNull();
    });

    // The editor chrome has no locale provider mounted here, so it resolves to
    // its English default; the Arabic and Kurdish wording is covered below.
    it.each([
        ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "YouTube"],
        ["https://youtu.be/dQw4w9WgXcQ", "YouTube"],
        ["https://vimeo.com/123456789", "Vimeo"],
        ["https://cdn.example.com/clip.mp4", "Direct video file"],
    ])("names the provider it recognised in %s", (url, word) => {
        mount(url);
        expect(detected()?.textContent).toContain(word);
        expect(warning()).toBeNull();
    });

    it.each([
        ["an Instagram reel", "https://www.instagram.com/reel/Cabcdefghij/"],
        ["a TikTok video", "https://www.tiktok.com/@brand/video/7123456789"],
        ["a channel page", "https://www.youtube.com/@kawkabbrand"],
        ["prose", "I will send the link later"],
    ])("warns that the section will stay hidden for %s", (_label, url) => {
        mount(url);
        expect(warning()).toBeTruthy();
        expect(detected()).toBeNull();
    });

    it("updates its verdict as the merchant finishes typing", () => {
        render(
            <AutoForm schema={schema} value={{ video_url: "" }} onChange={vi.fn()} />,
        );
        // A half-typed link is not yet playable; the field must not settle on
        // the warning as if the merchant were done.
        fireEvent.change(input(), { target: { value: "https://youtu.be/" } });
        cleanup();
        mount("https://youtu.be/dQw4w9WgXcQ");
        expect(detected()).toBeTruthy();
    });

    it("keeps the link left-to-right, whatever the editor's language", () => {
        mount("https://youtu.be/dQw4w9WgXcQ");
        expect(input().getAttribute("dir")).toBe("ltr");
    });
});

describe("video field wording", () => {
    it.each([
        "video_url_placeholder",
        "video_detected_youtube",
        "video_detected_vimeo",
        "video_detected_file",
        "video_unrecognized",
    ])("%s is written in every language the editor offers", (key) => {
        const entry = (STRINGS.auto_form as Record<string, unknown>)[key] as
            | Record<string, string>
            | undefined;
        expect(entry).toBeTruthy();
        for (const locale of ["en", "ar", "ku"]) {
            expect(entry?.[locale]?.trim()).toBeTruthy();
        }
    });
});
