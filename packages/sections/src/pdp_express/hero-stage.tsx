"use client";

// Express hero stage: a smaller, never-cropped product photo on a soft
// brand gradient. Extra photos live in a small deck at the bottom-left
// that rotates on its own; tapping it opens the focus strip below the
// hero so the shopper can study one photo at a time.

import { memo, useEffect, useRef, useState } from "react";
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
  alt,
  intervalMs,
  locale,
  onOpen,
}: {
  images: string[];
  alt: string;
  intervalMs: number;
  locale: LocaleCode;
  onOpen: (index: number) => void;
}) {
  const [front, setFront] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduce = usePrefersReducedMotion();
  const running = !paused && !reduce && images.length > 1;

  useEffect(() => {
    if (!running) return;
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id === null) {
        id = setInterval(
          () => setFront((f) => (f + 1) % images.length),
          intervalMs,
        );
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
    <div className="absolute bottom-3 left-3 z-10 flex items-end gap-2">
      <button
        type="button"
        onClick={() => onOpen(front)}
        aria-label={xs("morePhotos", locale, { count: images.length })}
        className="relative h-[84px] w-[64px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus rounded-bk-input"
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
                className="absolute inset-0 overflow-hidden rounded-bk-input border-bk border-bk-surface bg-bk-surface shadow-bk-card transition-[transform,opacity] duration-bk-base ease-out motion-reduce:transition-none"
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
                  sizes="64px"
                  unoptimized={!isOptimizableImageHost(src)}
                  className="object-cover"
                />
              </span>
            );
          })}
        <span
          aria-hidden="true"
          className="absolute -bottom-1.5 -right-1.5 z-10 flex h-6 min-w-6 items-center justify-center rounded-bk-pill bg-bk-secondary px-1.5 font-bk-display text-[11px] font-black tabular-nums text-bk-on-secondary"
        >
          {images.length}
        </span>
      </button>
      {images.length > 1 && !reduce && (
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
          aria-label={xs(paused ? "playRotation" : "pauseRotation", locale)}
          className="flex h-11 w-11 items-center justify-center"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-bk-pill bg-bk-surface/80 text-bk-ink shadow-bk-card backdrop-blur-sm">
            <MaterialIcon
              name={paused ? "play_arrow" : "pause"}
              className="text-base"
            />
          </span>
        </button>
      )}
      <span className="sr-only">{alt}</span>
    </div>
  );
});

/** The inline focus strip under the hero — every photo, one at a time,
 *  swipeable, never cropped. */
function FocusPanel({
  images,
  alt,
  startIndex,
  locale,
  onClose,
}: {
  images: string[];
  alt: string;
  startIndex: number;
  locale: LocaleCode;
  onClose: () => void;
}) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [current, setCurrent] = useState(startIndex);

  useEffect(() => {
    const strip = stripRef.current;
    if (strip) strip.scrollLeft = strip.clientWidth * startIndex;
    closeRef.current?.focus({ preventScroll: true });
  }, [startIndex]);

  return (
    <div className="bg-bk-surface-alt pb-bk-sm">
      <div
        ref={stripRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setCurrent(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
        className={cn(
          "flex snap-x snap-mandatory overflow-x-auto",
          HIDE_SCROLLBAR,
        )}
      >
        {images.map((src, i) => (
          <div
            key={`${i}-${src}`}
            className="relative aspect-[4/5] max-h-[72vh] w-full shrink-0 snap-center"
          >
            <Image
              src={src}
              alt={xs("photoOf", locale, { n: i + 1, total: images.length }) + ` — ${alt}`}
              fill
              sizes="100vw"
              unoptimized={!isOptimizableImageHost(src)}
              className="object-contain"
            />
          </div>
        ))}
      </div>
      <div className="flex h-11 items-center justify-between px-4">
        <span className="font-bk-body text-sm tabular-nums text-bk-ink-soft">
          <bdi>
            {Math.min(current, images.length - 1) + 1} / {images.length}
          </bdi>
        </span>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="flex h-11 items-center gap-1 px-2 font-bk-body text-sm font-bold text-bk-ink"
        >
          <MaterialIcon name="close" className="text-lg" />
          {xs("closePhotos", locale)}
        </button>
      </div>
    </div>
  );
}

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
  const [focusAt, setFocusAt] = useState<number | null>(null);
  const cover = images[0];
  const extras = images.slice(1);

  if (!cover) return null;

  return (
    <div>
      <div
        className="relative h-[260px] w-full overflow-hidden supports-[height:1svh]:h-[clamp(232px,35svh,320px)]"
        style={{
          background:
            "linear-gradient(to bottom, var(--bk-surface-alt), var(--bk-surface))",
        }}
      >
        <button
          type="button"
          onClick={() => setFocusAt(0)}
          aria-label={xs("morePhotos", locale, { count: images.length })}
          className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bk-focus"
        >
          {/* The LCP element: optimised, high priority, never cropped. */}
          <Image
            src={cover}
            alt={alt}
            fill
            priority
            fetchPriority="high"
            sizes="(min-width: 1024px) 50vw, 70vw"
            unoptimized={!isOptimizableImageHost(cover)}
            className="object-contain px-6 pb-3 pt-10"
          />
        </button>
        {extras.length > 0 && (
          <ThumbDeck
            images={images}
            alt={alt}
            intervalMs={intervalMs}
            locale={locale}
            onOpen={(i) => setFocusAt(i)}
          />
        )}
        <div data-pdp-hero-end aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px" />
      </div>
      <div
        className="grid transition-[grid-template-rows] duration-bk-base ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: focusAt === null ? "0fr" : "1fr" }}
      >
        <div className="min-h-0 overflow-hidden" inert={focusAt === null}>
          {focusAt !== null && (
            <FocusPanel
              images={images}
              alt={alt}
              startIndex={focusAt}
              locale={locale}
              onClose={() => setFocusAt(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
