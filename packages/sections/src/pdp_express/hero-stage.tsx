"use client";

// Express hero stage: the product photo fills the top half of the screen,
// edge to edge. Extra photos live in a small deck at its bottom-left that
// rotates on its own; tapping the deck slides a row of thumbnails out
// under the photo, and tapping a thumbnail makes it the main photo.

import { memo, useEffect, useState } from "react";
import Image from "next/image";
import type { LocaleCode } from "@scheniders/shared";
import { cn } from "@scheniders/shared";
import { isOptimizableImageHost } from "../helpers/image";
import { MaterialIcon } from "../helpers/primitives";
import { xs } from "./text";

const HIDE_SCROLLBAR =
  "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const on = () => setReduce(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduce;
}

/** The deck's front card advances every `intervalMs` while it is allowed
 *  to (not paused, motion allowed, tab visible). Isolated + memoized so the
 *  tick never re-renders the order form. */
const ThumbDeck = memo(function ThumbDeck({
  images,
  total,
  intervalMs,
  paused,
  open,
  locale,
  onToggle,
}: {
  /** The photos the deck cycles through (every photo but the one shown). */
  images: string[];
  /** Every photo, the shown one included (the badge count). */
  total: number;
  intervalMs: number;
  paused: boolean;
  open: boolean;
  locale: LocaleCode;
  onToggle: () => void;
}) {
  const [front, setFront] = useState(0);
  const reduce = usePrefersReducedMotion();
  const running = !paused && !reduce && images.length > 1;

  useEffect(() => {
    if (!running) return;
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id === null) {
        id = setInterval(() => setFront((f) => (f + 1) % images.length), intervalMs);
      }
    };
    const stop = () => {
      if (id !== null) clearInterval(id);
      id = null;
    };
    const onVis = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [running, images.length, intervalMs]);

  // Up to three cards: the front one plus two peeking behind it.
  const stack = [0, 1, 2]
    .slice(0, Math.min(3, images.length))
    .map((d) => (front + d) % images.length);

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={xs("morePhotos", locale, { count: total })}
      className="absolute bottom-4 left-4 z-10 h-[78px] w-[60px] rounded-bk-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus"
    >
      {stack
        .slice()
        .reverse()
        .map((imgIndex) => {
          const depth = stack.indexOf(imgIndex);
          const src = images[imgIndex];
          if (!src) return null;
          return (
            <span
              key={imgIndex}
              aria-hidden="true"
              className="absolute inset-0 overflow-hidden rounded-bk-input border-bk-bold border-bk-surface bg-bk-surface shadow-bk-card transition-[transform,opacity] duration-bk-base ease-out motion-reduce:transition-none"
              style={{
                transform: `translate(${depth * 7}px, ${depth * -5}px) scale(${1 - depth * 0.08})`,
                opacity: depth === 0 ? 1 : 1 - depth * 0.3,
                zIndex: 3 - depth,
              }}
            >
              <Image
                src={src}
                alt=""
                fill
                sizes="60px"
                unoptimized={!isOptimizableImageHost(src)}
                className="object-cover"
              />
            </span>
          );
        })}
      <span
        aria-hidden="true"
        className="absolute -bottom-1.5 -right-1.5 z-10 flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-bk-pill bg-bk-secondary px-1.5 font-bk-display text-[11px] font-black tabular-nums text-bk-on-secondary"
      >
        <MaterialIcon name={open ? "expand_less" : "photo_library"} className="text-[13px]" />
        {total}
      </span>
    </button>
  );
});

export function HeroStage({
  images,
  alt,
  locale,
  intervalMs,
}: {
  images: string[];
  alt: string;
  locale: LocaleCode;
  intervalMs: number;
}) {
  const [active, setActive] = useState(0);
  const [thumbsOpen, setThumbsOpen] = useState(false);
  const current = images[active] ?? images[0];
  if (!current) return null;
  const others = images.filter((_, i) => i !== active);

  return (
    <div>
      <div className="relative h-[50vh] w-full overflow-hidden bg-bk-surface-alt supports-[height:1svh]:h-[50svh]">
        {images.map((src, i) =>
          // Every photo is mounted once so switching is an instant crossfade;
          // only the cover is the LCP candidate (priority), the rest lazy.
          i === active || i === 0 ? (
            <Image
              key={src}
              src={src}
              alt={i === active ? alt : ""}
              fill
              priority={i === 0}
              fetchPriority={i === 0 ? "high" : undefined}
              sizes="(min-width: 1024px) 50vw, 100vw"
              unoptimized={!isOptimizableImageHost(src)}
              className={cn(
                "object-cover transition-opacity duration-bk-base motion-reduce:transition-none",
                i === active ? "opacity-100" : "opacity-0",
              )}
            />
          ) : null,
        )}
        {/* Soft scrims so the floating store name / menu and the deck read
            on any photo. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-24"
          style={{
            background:
              "linear-gradient(to bottom, color-mix(in srgb, var(--bk-secondary) 35%, transparent), transparent)",
          }}
        />
        {others.length > 0 && (
          <ThumbDeck
            images={others}
            total={images.length}
            intervalMs={intervalMs}
            paused={thumbsOpen}
            open={thumbsOpen}
            locale={locale}
            onToggle={() => setThumbsOpen((o) => !o)}
          />
        )}
        <div data-pdp-hero-end aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px" />
      </div>

      {images.length > 1 && (
        <div
          className="grid transition-[grid-template-rows] duration-bk-base ease-out motion-reduce:transition-none"
          style={{ gridTemplateRows: thumbsOpen ? "1fr" : "0fr" }}
        >
          <div className="min-h-0 overflow-hidden" inert={!thumbsOpen}>
            <div
              role="group"
              aria-label={xs("morePhotos", locale, { count: images.length })}
              className={cn("flex gap-2 overflow-x-auto px-4 py-3", HIDE_SCROLLBAR)}
            >
              {images.map((src, i) => (
                <button
                  key={`${i}-${src}`}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-pressed={i === active}
                  aria-label={xs("photoOf", locale, { n: i + 1, total: images.length })}
                  className={cn(
                    "relative h-16 w-14 shrink-0 overflow-hidden rounded-bk-input border-bk-bold transition-[border-color,opacity] duration-bk-fast motion-reduce:transition-none",
                    i === active ? "border-bk-ink" : "border-transparent opacity-70",
                  )}
                >
                  <Image
                    src={src}
                    alt=""
                    fill
                    sizes="56px"
                    unoptimized={!isOptimizableImageHost(src)}
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
