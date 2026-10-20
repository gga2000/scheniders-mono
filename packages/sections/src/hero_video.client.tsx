// =====================================================================
// Client half of `hero_video` — the background film.
// =====================================================================
// The element is server-rendered with its poster and **without** `autoPlay`,
// then played from here. Two reasons it is not just native autoplay:
//
//   * `prefers-reduced-motion: reduce` is exactly a request not to be shown
//     a looping full-bleed film. Native autoplay cannot be gated in CSS, and
//     starting playback and then pausing it still shows the motion the reader
//     asked not to see. Deciding before the first frame is the only honest
//     way to honour it.
//   * Without `autoPlay`, `preload="metadata"` really does stop at the
//     metadata. A hero that autoplays natively pulls the whole file down on
//     arrival, which on the mobile data plans this store sells over is the
//     most expensive thing on the page.
//
// The poster paints on the server either way, so the hero has its image
// before any of this runs and the reader never waits on hydration to see it.
//
// The schema, defaults and registry entry stay in `./hero_video.tsx` so the
// definition is server-safe; only this module reaches the browser.
// =====================================================================

"use client";

import * as React from "react";

export interface HeroVideoMediaProps {
    src: string;
    poster?: string;
    className: string;
}

export function HeroVideoMedia({
    src,
    poster,
    className,
}: HeroVideoMediaProps): React.ReactElement {
    const ref = React.useRef<HTMLVideoElement>(null);

    React.useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const query = window.matchMedia("(prefers-reduced-motion: reduce)");

        const apply = (): void => {
            if (query.matches) {
                el.pause();
                return;
            }
            // A browser may still refuse even a muted video (NotAllowedError),
            // or a pause may interrupt the start (AbortError). Both leave the
            // poster up, which is the intended fallback. Anything else — an
            // unplayable source — is a real fault and is reported.
            el.play().catch((err: unknown) => {
                if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "AbortError")) {
                    return;
                }
                console.error("[hero_video] playback failed", err);
            });
        };

        apply();
        query.addEventListener("change", apply);
        return () => query.removeEventListener("change", apply);
    }, []);

    return (
        <video
            ref={ref}
            className={className}
            src={src}
            poster={poster}
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden="true"
        />
    );
}
