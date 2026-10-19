"use client";

// =====================================================================
// CarouselArrows — desktop prev/next for a scroll-snap track (P3-10).
// The track stays a server-rendered element; the arrows find it by id and
// scroll it by one card (first child width + gap). Hidden below `sm:`
// (touch scrolls the track directly) and `motion-reduce` skips the smooth
// scroll. LTR only — prev is always leftwards.
// =====================================================================

import { MaterialIcon } from "./primitives";
import { cn } from "./utils";

function scrollTrack(trackId: string, direction: -1 | 1): void {
  const track = document.getElementById(trackId);
  if (!track) return;
  const first = track.firstElementChild;
  const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
  const step =
    first instanceof HTMLElement ? first.offsetWidth + gap : track.clientWidth;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  track.scrollBy({
    left: direction * step,
    behavior: reduce ? "auto" : "smooth",
  });
}

const ARROW_CLS =
  "hidden sm:inline-flex h-11 w-11 items-center justify-center rounded-full " +
  "transition-[opacity,transform] duration-bk-fast motion-reduce:transition-none hover:opacity-90 active:scale-[0.95] " +
  "focus-visible:outline-none focus-visible:ring-2 ring-bk-focus ring-offset-2";

const ARROW_STYLE = {
  backgroundColor: "var(--bk-surface, #ffffff)",
  color: "var(--bk-ink, #1a1a1a)",
  border: "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
  boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
} as const;

export function CarouselArrows({
  trackId,
  prevLabel,
  nextLabel,
  className,
}: {
  trackId: string;
  prevLabel: string;
  nextLabel: string;
  className?: string;
}) {
  return (
    <div className={cn("hidden sm:flex items-center gap-2", className)}>
      <button
        type="button"
        aria-label={prevLabel}
        aria-controls={trackId}
        onClick={() => scrollTrack(trackId, -1)}
        className={ARROW_CLS}
        style={ARROW_STYLE}
      >
        <MaterialIcon name="arrow_back" />
      </button>
      <button
        type="button"
        aria-label={nextLabel}
        aria-controls={trackId}
        onClick={() => scrollTrack(trackId, 1)}
        className={ARROW_CLS}
        style={ARROW_STYLE}
      >
        <MaterialIcon name="arrow_forward" />
      </button>
    </div>
  );
}
