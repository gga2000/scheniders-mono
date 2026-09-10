// video_block + hero_video (W7.7) — what a merchant's pasted link actually
// puts on a shopper's page. Three things are load-bearing here: a link the
// storefront cannot read renders nothing rather than a broken player, an
// embed costs nothing until someone presses play, and the schema stays
// additive so a section saved before this change still parses.

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import video_block from "./video_block";
import hero_video from "./hero_video";
import type { SectionRenderContext } from "./_types";

const runtime = {
  page_id: "home" as const,
  breakpoint: "mobile" as const,
  locale: "ar" as const,
  audience_segments: [],
  ab_test_arms: {},
  now: new Date("2026-09-11T00:00:00Z"),
};

const tenant = { id: "tenant-1", business_name: "متجر", store_config: {} };

function renderSection(
  section: typeof video_block | typeof hero_video,
  props: Record<string, unknown> = {},
): string {
  const Render = section.render as React.ComponentType<{
    props: unknown;
    ctx: SectionRenderContext;
  }>;
  return renderToStaticMarkup(
    React.createElement(
      StoreBaseProvider,
      { base: "", children: null },
      React.createElement(Render, {
        props: { ...section.defaultProps, ...props },
        ctx: {
          tenant: tenant as never,
          runtime,
          products: [],
          categories: [],
        } as unknown as SectionRenderContext,
      }),
    ),
  );
}

const block = (props: Record<string, unknown>) => renderSection(video_block, props);
const hero = (props: Record<string, unknown>) => renderSection(hero_video, props);

describe("video_block — a link it cannot read renders nothing", () => {
  it("renders nothing with no link at all", () => {
    expect(block({ video_url: "" })).toBe("");
  });

  it.each([
    ["an Instagram reel", "https://www.instagram.com/reel/Cabcdefghij/"],
    ["a TikTok video", "https://www.tiktok.com/@brand/video/7123456789"],
    ["a half-copied URL", "youtube.com/watch?v="],
    ["prose", "I will send you the link"],
    ["a plain page", "https://example.com/our-video"],
  ])("renders nothing for %s", (_label, video_url) => {
    // The previous parser called every one of these a playable file and put a
    // black <video> box on the live storefront.
    expect(block({ video_url })).toBe("");
  });
});

describe("video_block — an embed costs nothing until play is pressed", () => {
  const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

  it("ships no iframe before the click", () => {
    const html = block({ video_url: YT });
    expect(html).not.toContain("<iframe");
    expect(html).toContain("<button");
  });

  it("shows the provider thumbnail as the poster", () => {
    expect(block({ video_url: YT })).toContain("i.ytimg.com");
  });

  it("prefers the merchant's own poster over the provider thumbnail", () => {
    const html = block({
      video_url: YT,
      poster_url: "https://cdn.example.com/still.jpg",
    });
    expect(html).toContain("still.jpg");
    expect(html).not.toContain("i.ytimg.com");
  });

  it("names the play control after the heading, in the store's locale", () => {
    const html = block({
      video_url: YT,
      heading_i18n: { en: "See it", ar: "شوفه بالحركة" },
    });
    expect(html).toContain("شغّل الفيديو");
    expect(html).toContain("شوفه بالحركة");
  });

  it("still names the control when the merchant set no heading", () => {
    const html = block({ video_url: YT, heading_i18n: undefined });
    expect(html).toContain("فيديو");
  });

  it("renders the iframe up front only when the merchant asked for autoplay", () => {
    const html = block({ video_url: YT, autoplay: true });
    expect(html).toContain("<iframe");
    expect(html).toContain("youtube-nocookie.com");
  });

  it("mutes an autoplaying embed even when told not to", () => {
    // An unmuted autoplay is blocked, which would leave a frozen frame.
    const html = block({ video_url: YT, autoplay: true, muted: false });
    expect(html).toContain("mute=1");
  });
});

describe("video_block — a direct file plays natively", () => {
  const FILE = "https://cdn.example.com/clip.mp4";

  it("renders a real player with controls, not a facade", () => {
    const html = block({ video_url: FILE });
    expect(html).toContain("<video");
    expect(html).toContain("controls");
    expect(html).not.toContain("<iframe");
  });

  it("does not pull the file down before the shopper asks for it", () => {
    expect(block({ video_url: FILE })).toContain('preload="metadata"');
  });

  it("mutes an autoplaying file even when told not to", () => {
    const html = block({ video_url: FILE, autoplay: true, muted: false });
    expect(html).toContain("muted");
  });
});

describe("video_block — shape of the frame", () => {
  const YT = "https://youtu.be/dQw4w9WgXcQ";

  it("is 16:9 when the merchant chose nothing", () => {
    expect(block({ video_url: YT })).toContain("aspect-video");
  });

  it("fits portrait footage without black bars", () => {
    // Merchant footage in this market is shot on a phone.
    expect(block({ video_url: YT, aspect: "9:16" })).toContain("aspect-[9/16]");
  });
});

describe("video_block — the schema stays additive", () => {
  it("parses a section saved before `aspect` existed", () => {
    const legacy = {
      heading_i18n: { en: "See it in motion", ar: "شاهده بالحركة" },
      video_url: "https://youtu.be/dQw4w9WgXcQ",
      autoplay: false,
      muted: true,
      body_i18n: { en: "A walkthrough.", ar: "جولة." },
    };
    const parsed = video_block.schema.safeParse(legacy);
    expect(parsed.success).toBe(true);
    // A section that fails to parse is dropped silently at render.
    if (parsed.success) expect(parsed.data.aspect).toBeUndefined();
  });

  it("parses its own defaults", () => {
    expect(video_block.schema.safeParse(video_block.defaultProps).success).toBe(true);
  });
});

describe("hero_video — the background film", () => {
  it("falls back to the gradient when no film is set", () => {
    const html = hero({ video_url: "" });
    expect(html).not.toContain("<video");
    expect(html).toContain("bg-gradient-to-br");
  });

  it("falls back to the gradient for a YouTube link", () => {
    // A player with its own chrome cannot sit behind a headline, and the
    // previous version rendered it as a <video src> that plays nothing.
    const html = hero({ video_url: "https://youtu.be/dQw4w9WgXcQ" });
    expect(html).not.toContain("<video");
    expect(html).toContain("bg-gradient-to-br");
  });

  it("plays a direct file behind the headline", () => {
    const html = hero({ video_url: "https://cdn.example.com/film.mp4" });
    expect(html).toContain("<video");
    expect(html).toContain("film.mp4");
  });

  it("does not autoplay in the served markup", () => {
    // Autoplay is decided in the browser, after `prefers-reduced-motion` is
    // known — and without it `preload="metadata"` really stops at metadata.
    const html = hero({ video_url: "https://cdn.example.com/film.mp4" });
    expect(html).not.toContain("autoplay");
    expect(html).toContain('preload="metadata"');
  });

  it("keeps the film out of the accessibility tree", () => {
    const html = hero({ video_url: "https://cdn.example.com/film.mp4" });
    expect(html).toContain('aria-hidden="true"');
  });

  it("takes its headline shadow from the brand kit, not a fixed ink", () => {
    // The shadow was `#1a1a1a` — the old candy ink — so a merchant who
    // recoloured their kit still got that one shadow. (The `var(--bk-ink,
    // #1a1a1a)` fallbacks elsewhere in the markup are the shared primitives'
    // CSS defaults, which is a different thing: those follow the token.)
    const html = hero({ video_url: "" });
    const shadow = html.match(/drop-shadow-\[[^\]]*\]/)?.[0];
    expect(shadow).toBe("drop-shadow-[2px_2px_0_var(--bk-ink)]");
  });
});
