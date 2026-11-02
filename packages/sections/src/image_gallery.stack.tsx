"use client";

// =====================================================================
// image_gallery — the proof carousel's position dots
// =====================================================================
// The comment cards are server-rendered in a scroll-snap track, so every
// one is in the HTML for crawlers. This island only follows the track:
// one dot per card, the current one drawn as a wider pill. A tap on a dot
// scrolls its card into place (instantly under prefers-reduced-motion).
// The track is found by id, like CarouselArrows. In Arabic the track is
// flex-row-reverse, so its scroll origin is the right edge and scrollLeft
// runs negative; positions are read and written mirrored.
// =====================================================================

import { useEffect, useState } from "react";
import { cn } from "./helpers/utils";

function stepOf(track: HTMLElement): number {
  const first = track.firstElementChild;
  const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
  return first instanceof HTMLElement ? first.offsetWidth + gap : track.clientWidth;
}

export function ProofCarouselDots({
  trackId,
  rtl,
  labels,
}: {
  trackId: string;
  /** The track is reversed (Arabic): scrollLeft runs from 0 to negative. */
  rtl: boolean;
  /** One accessible name per card («التعليق 3»), in track order. */
  labels: string[];
}) {
  const [active, setActive] = useState(0);
  const count = labels.length;

  useEffect(() => {
    const track = document.getElementById(trackId);
    if (!track) return;
    const onScroll = () => {
      const step = stepOf(track);
      if (step <= 0) return;
      setActive(Math.min(count - 1, Math.max(0, Math.round(Math.abs(track.scrollLeft) / step))));
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => track.removeEventListener("scroll", onScroll);
  }, [trackId, count]);

  if (count < 2) return null;

  const go = (i: number) => {
    const track = document.getElementById(trackId);
    if (!track) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({ left: (rtl ? -i : i) * stepOf(track), behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <div
      data-proof-dots="true"
      className={cn("mt-bk-sm flex items-center justify-center gap-0.5", rtl && "flex-row-reverse")}
    >
      {labels.map((label, i) => (
        <button
          key={i}
          type="button"
          aria-label={label}
          aria-controls={trackId}
          aria-current={i === active ? "true" : undefined}
          onClick={() => go(i)}
          className="inline-flex size-6 items-center justify-center focus-visible:outline-none focus-visible:ring-2 ring-bk-focus rounded-bk-pill"
        >
          <span
            aria-hidden="true"
            className={cn(
              "block h-1.5 rounded-bk-pill transition-[width,background-color] duration-bk-fast motion-reduce:transition-none",
              i === active ? "w-5 bg-bk-ink" : "w-1.5 bg-bk-divider",
            )}
          />
        </button>
      ))}
    </div>
  );
}
