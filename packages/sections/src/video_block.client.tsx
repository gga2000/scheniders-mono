// =====================================================================
// Client half of `video_block` — the click-to-play facade.
// =====================================================================
// An embedded YouTube or Vimeo player costs the shopper roughly a megabyte
// of player JavaScript before a single frame appears, on every page load,
// whether or not they ever press play. On the mobile data plans this store
// actually sells over, that is the most expensive thing on the page.
//
// So the section ships a poster and a play button. The iframe is created on
// the first click, with autoplay set, so the press that starts the video is
// the press that pays for the player. The markup before the click is a
// button and an image — no third-party request at all.
//
// The schema, defaults and registry entry stay in `./video_block.tsx` so the
// definition is server-safe; only this module reaches the browser.
// =====================================================================

"use client";

import * as React from "react";
import Image from "next/image";
import { videoEmbedSrc, type ParsedVideo } from "@scheniders/shared";

export interface VideoFacadeProps {
    video: ParsedVideo;
    /** Provider thumbnail or the merchant's own poster. Null renders the plain ink card. */
    poster: string | null;
    /** Accessible name for the iframe and the play button. */
    label: string;
    /** Localized "play" wording under the button. */
    playLabel: string;
}

export function VideoFacade({
    video,
    poster,
    label,
    playLabel,
}: VideoFacadeProps): React.ReactElement {
    const [playing, setPlaying] = React.useState(false);

    if (playing) {
        return (
            <iframe
                src={videoEmbedSrc(video, { autoplay: true })}
                title={label}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
            />
        );
    }

    return (
        <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`${playLabel}: ${label}`}
            className="group absolute inset-0 h-full w-full cursor-pointer"
        >
            {poster && (
                <Image
                    src={poster}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 800px"
                    className="object-cover"
                />
            )}
            <span
                aria-hidden="true"
                className="absolute inset-0 flex items-center justify-center bg-bk-ink/30 transition-colors duration-bk-fast motion-reduce:transition-none group-hover:bg-bk-ink/20"
            >
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-bk-primary text-bk-on-primary shadow-lg transition-transform duration-bk-fast motion-reduce:transition-none group-hover:scale-105">
                    <svg
                        viewBox="0 0 24 24"
                        className="ms-1 h-7 w-7"
                        fill="currentColor"
                        aria-hidden="true"
                    >
                        <path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11.14-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14Z" />
                    </svg>
                </span>
            </span>
        </button>
    );
}
