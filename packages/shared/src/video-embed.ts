// =====================================================================
// Video embed parsing — one source of truth for merchant-supplied links
// =====================================================================
// A merchant pastes a URL into the store builder. Both the editor (to tell
// them what it recognised) and the storefront (to render it) have to agree
// on what that URL means, so the parsing lives here and not in either.
//
// Design rules:
//   * An unrecognised link returns `null`, never a "file". Guessing that an
//     arbitrary URL is a playable file renders a black box on the shopper's
//     page; refusing it lets the editor say so and the section render nothing.
//   * Parsing goes through `URL`, not a regex over the raw string. A regex for
//     `[?&]v=` matches `https://example.com/?v=abcdefghijk`, which is not a
//     YouTube video.
//   * Embed parameters are per-provider. YouTube mutes with `mute=1`; Vimeo
//     with `muted=1`. Sending Vimeo's name to YouTube leaves the player
//     unmuted, and every browser then blocks the autoplay that was asked for.
// =====================================================================

export type VideoProvider = "youtube" | "vimeo" | "file";

export interface ParsedVideo {
    provider: VideoProvider;
    /** Provider video id — an 11-character YouTube id or a numeric Vimeo id. Empty for files. */
    id: string;
    /** Vimeo unlisted-link hash (`vimeo.com/<id>/<hash>`), when the link carries one. */
    hash?: string;
    /** Playable URL. The direct file for `file`; unused for the embed providers. */
    src: string;
}

const YOUTUBE_HOSTS = new Set([
    "youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtube-nocookie.com",
]);

const VIMEO_HOSTS = new Set(["vimeo.com", "player.vimeo.com"]);

/** Extensions a browser `<video>` element can actually play from a plain URL. */
const FILE_EXT = /\.(mp4|m4v|webm|ogv|ogg|mov)$/i;

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{6,}$/;
/** Vimeo unlisted hashes are short lowercase hex. */
const VIMEO_HASH = /^[0-9a-f]{6,16}$/;

/** Strip `www.` and lowercase, so host comparison is a set lookup. */
function hostOf(u: URL): string {
    return u.hostname.replace(/^www\./i, "").toLowerCase();
}

function segments(u: URL): string[] {
    return u.pathname.split("/").filter(Boolean);
}

function youtube(u: URL, host: string): ParsedVideo | null {
    let id: string | null = null;

    if (host === "youtu.be") {
        id = segments(u)[0] ?? null;
    } else if (YOUTUBE_HOSTS.has(host)) {
        const seg = segments(u);
        if (seg[0] === "watch") {
            id = u.searchParams.get("v");
        } else if (
            seg.length >= 2 &&
            (seg[0] === "embed" || seg[0] === "shorts" || seg[0] === "live" || seg[0] === "v")
        ) {
            id = seg[1] ?? null;
        }
    }

    if (!id || !YOUTUBE_ID.test(id)) return null;
    return { provider: "youtube", id, src: "" };
}

function vimeo(u: URL, host: string): ParsedVideo | null {
    if (!VIMEO_HOSTS.has(host)) return null;
    const seg = segments(u);

    // `player.vimeo.com/video/<id>` carries its hash as `?h=`; the share link
    // `vimeo.com/<id>/<hash>` carries it as the segment after the id.
    const idIndex = seg.findIndex((s) => VIMEO_ID.test(s));
    if (idIndex === -1) return null;
    const id = seg[idIndex];

    const next = seg[idIndex + 1];
    const hash =
        u.searchParams.get("h") ?? (next && VIMEO_HASH.test(next) ? next : null);

    return {
        provider: "vimeo",
        id,
        ...(hash && VIMEO_HASH.test(hash) ? { hash } : {}),
        src: "",
    };
}

/**
 * Parse a merchant-supplied video link.
 *
 * Returns `null` for anything not recognisably a YouTube video, a Vimeo video,
 * or a direct file — including empty input, a bare id, a channel page, a
 * playlist without a video, and links from providers with no public embed.
 */
export function parseVideoUrl(raw: string): ParsedVideo | null {
    const trimmed = (raw ?? "").trim();
    if (!trimmed) return null;

    // A protocol-relative or bare-host link is still a link the merchant meant.
    const candidate = /^https?:\/\//i.test(trimmed)
        ? trimmed
        : trimmed.startsWith("//")
          ? `https:${trimmed}`
          : `https://${trimmed}`;

    let u: URL;
    try {
        u = new URL(candidate);
    } catch {
        return null;
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;

    const host = hostOf(u);

    const yt = youtube(u, host);
    if (yt) return yt;

    const vm = vimeo(u, host);
    if (vm) return vm;

    if (FILE_EXT.test(u.pathname)) {
        return { provider: "file", id: "", src: u.toString() };
    }

    return null;
}

export interface VideoEmbedOptions {
    autoplay?: boolean;
    muted?: boolean;
    loop?: boolean;
}

/**
 * Build the iframe `src` for an embed provider, or the file URL for a file.
 *
 * Autoplay implies mute: a player that autoplays with sound is blocked by
 * every current browser, so asking for one silently produces a dead frame.
 */
export function videoEmbedSrc(
    video: ParsedVideo,
    options: VideoEmbedOptions = {},
): string {
    const autoplay = options.autoplay === true;
    const muted = options.muted === true || autoplay;
    const loop = options.loop === true;

    if (video.provider === "file") return video.src;

    const params = new URLSearchParams();

    if (video.provider === "youtube") {
        // youtube-nocookie serves the same player without the tracking cookie.
        if (autoplay) params.set("autoplay", "1");
        if (muted) params.set("mute", "1");
        if (loop) {
            // YouTube only loops a playlist; a single video loops by naming itself.
            params.set("loop", "1");
            params.set("playlist", video.id);
        }
        params.set("playsinline", "1");
        params.set("rel", "0");
        params.set("modestbranding", "1");
        return `https://www.youtube-nocookie.com/embed/${video.id}?${params.toString()}`;
    }

    if (video.hash) params.set("h", video.hash);
    if (autoplay) params.set("autoplay", "1");
    if (muted) params.set("muted", "1");
    if (loop) params.set("loop", "1");
    params.set("playsinline", "1");
    params.set("dnt", "1");
    return `https://player.vimeo.com/video/${video.id}?${params.toString()}`;
}

/**
 * A poster image the provider serves without an API call, or `null` when there
 * is none. `hqdefault` exists for every YouTube video; `maxresdefault` 404s for
 * anything never uploaded above 720p. Vimeo thumbnails need an authenticated
 * API call, so a Vimeo embed falls back to the merchant's own poster.
 */
export function videoPosterUrl(video: ParsedVideo): string | null {
    if (video.provider === "youtube") {
        return `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
    }
    return null;
}
