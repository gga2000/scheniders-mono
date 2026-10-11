/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { parseAdAttribution } from "@/lib/ad-attribution";
import { AdChannelBadge } from "./ad-channel-badge";

afterEach(cleanup);

const FB = [
    { k: "source", v: "fb" },
    { k: "medium", v: "Facebook_Mobile_Reels" },
    { k: "campaign", v: "بيرسيفيرون" },
    { k: "id", v: "120248083800400132" },
];
const IG = [{ k: "source", v: "ig" }, { k: "medium", v: "Instagram_Reels" }];

describe("AdChannelBadge", () => {
    it("tells Facebook and Instagram apart", () => {
        const { container } = render(<AdChannelBadge attribution={parseAdAttribution(FB)} />);
        expect(container.querySelector('[data-ad-channel="facebook"]')).toBeTruthy();
        expect(screen.getByText("Facebook")).toBeTruthy();

        cleanup();
        const ig = render(<AdChannelBadge attribution={parseAdAttribution(IG)} />);
        expect(ig.container.querySelector('[data-ad-channel="instagram"]')).toBeTruthy();
        expect(screen.getByText("Instagram")).toBeTruthy();
    });

    it("shows the placement without repeating the network", () => {
        render(<AdChannelBadge attribution={parseAdAttribution(FB)} />);
        expect(screen.getByText("· Mobile Reels")).toBeTruthy();
    });

    it("puts the full trail in the tooltip", () => {
        const { container } = render(<AdChannelBadge attribution={parseAdAttribution(FB)} />);
        const title = container.querySelector("[data-ad-channel]")?.getAttribute("title") ?? "";
        expect(title).toContain("Facebook");
        expect(title).toContain("بيرسيفيرون");
        expect(title).toContain("120248083800400132");
    });

    it("drops the placement in compact mode", () => {
        render(<AdChannelBadge attribution={parseAdAttribution(FB)} compact />);
        expect(screen.queryByText("· Mobile Reels")).toBeNull();
        expect(screen.getByText("Facebook")).toBeTruthy();
    });

    it("renders nothing when the order has no attribution", () => {
        const { container } = render(<AdChannelBadge attribution={undefined} />);
        expect(container.firstChild).toBeNull();
    });

    it("falls back to the bare channel column on older rows", () => {
        // Backfilled rows may carry ad_channel without the full jsonb.
        const { container } = render(<AdChannelBadge channel="tiktok" />);
        expect(container.querySelector('[data-ad-channel="tiktok"]')).toBeTruthy();
        expect(screen.getByText("TikTok")).toBeTruthy();
    });

    it("names an unknown network by its raw source instead of guessing", () => {
        render(<AdChannelBadge attribution={parseAdAttribution([{ k: "source", v: "pinterest" }])} />);
        expect(screen.getByText("pinterest")).toBeTruthy();
    });

    it("keeps the name for screen readers and the tooltip in icon-only mode", () => {
        const { container } = render(<AdChannelBadge attribution={parseAdAttribution(IG)} iconOnly />);
        const badge = container.querySelector('[data-ad-channel="instagram"]');
        expect(badge?.getAttribute("title")).toContain("Instagram");
        expect(screen.getByText("Instagram").className).toContain("sr-only");
        expect(screen.queryByText("· Reels")).toBeNull();
    });
});
