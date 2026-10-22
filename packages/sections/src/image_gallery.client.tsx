"use client";

// =====================================================================
// image_gallery — full-screen swipe viewer (opt-in `display: "whole"`)
// =====================================================================
// The cards stay server-rendered: one delegated click on the wrapper finds
// the nearest `[data-gallery-open]` and opens the viewer at that index, so
// only this dialog ships to the browser. The dialog copies the proven
// native-<dialog> pattern of pdp_gallery's ZoomDialog and product_reviews'
// PhotoLightbox: `showModal()` for the focus trap and Escape (cancel →
// close), a backdrop tap closes, the page scroll is locked while open and
// focus returns to the card that opened it. Slides are a native
// scroll-snap row (swipe + pinch-zoom); prev/next scroll it by one slide.
// While a prev/next glide is in flight the counter holds its target: a
// smooth scroll reports every frame, and the first half of each still
// rounds back to the slide it left.
// The slides render only while open — no SSR markup, no hidden downloads.
// Every label arrives resolved from the server module.
// =====================================================================

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent, ReactNode, UIEvent } from "react";
import { MaterialIcon } from "./helpers/primitives";
import { isOptimizableImageHost } from "./helpers/image";

export interface GalleryViewerImage {
  url: string;
  alt: string;
  /** Resolved "n of total" for this picture (counter + slide label). */
  counter: string;
}

export interface GalleryViewerLabels {
  close: string;
  prev: string;
  next: string;
}

/** How close (in slides) a glide must get to its target to count as
 *  landed: ~8px at 390px, wide enough to absorb a sub-pixel slide width
 *  that a snap point rounds to, far short of the next slide. */
const LANDED = 0.02;

const NAV_CLS =
  "inline-flex h-11 w-11 items-center justify-center rounded-bk-pill bg-bk-surface text-bk-ink " +
  "transition-opacity duration-bk-fast motion-reduce:transition-none disabled:opacity-40 " +
  "focus-visible:outline-none focus-visible:ring-2 ring-bk-focus";

export function GalleryViewer({
  images,
  labels,
  dialogLabel,
  children,
}: {
  images: GalleryViewerImage[];
  labels: GalleryViewerLabels;
  dialogLabel: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  /** The index the viewer opened at — read once by the open effect. */
  const startRef = useRef(0);
  /** The slide a prev/next glide is heading to; null when none is in
   *  flight. While set, scroll frames short of it don't move the index. */
  const glideRef = useRef<number | null>(null);
  const last = images.length - 1;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
      const prev = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
      const track = trackRef.current;
      if (track) track.scrollLeft = startRef.current * track.clientWidth;
      return () => {
        document.documentElement.style.overflow = prev;
      };
    }
    if (dialog.open) dialog.close();
    return undefined;
  }, [open]);

  // Runs twice on a button/backdrop close (here, then again from the
  // native close event once the effect closes the dialog). The second
  // focus is the one that lands: a modal dialog makes the page inert
  // until it is actually closed.
  const close = useCallback(() => {
    setOpen(false);
    openerRef.current?.focus();
  }, []);

  const onOpen = (e: MouseEvent<HTMLDivElement>) => {
    const target =
      e.target instanceof Element ? e.target.closest("[data-gallery-open]") : null;
    if (!(target instanceof HTMLElement)) return;
    const i = Number(target.dataset.galleryOpen);
    if (!Number.isInteger(i) || i < 0 || i > last) return;
    openerRef.current = target;
    startRef.current = i;
    glideRef.current = null;
    setIndex(i);
    setOpen(true);
  };

  const go = (i: number) => {
    const next = Math.min(Math.max(i, 0), last);
    setIndex(next);
    const track = trackRef.current;
    if (!track) return;
    const left = next * track.clientWidth;
    // Already resting there: no scroll frame would come to release a hold.
    glideRef.current = Math.abs(track.scrollLeft - left) < 1 ? null : next;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
  };

  const syncIndex = (track: HTMLDivElement) => {
    if (track.clientWidth <= 0) return;
    const position = track.scrollLeft / track.clientWidth;
    const target = glideRef.current;
    if (target !== null) {
      if (Math.abs(position - target) > LANDED) return;
      glideRef.current = null;
    }
    const i = Math.min(Math.max(Math.round(position), 0), last);
    setIndex((current) => (current === i ? current : i));
  };

  const onScroll = (e: UIEvent<HTMLDivElement>) => syncIndex(e.currentTarget);

  /** The scroll came to rest (or the hand took over): whatever the glide
   *  was heading for, the live position is the truth again. */
  const releaseGlide = () => {
    glideRef.current = null;
  };
  const onScrollEnd = (e: UIEvent<HTMLDivElement>) => {
    releaseGlide();
    syncIndex(e.currentTarget);
  };

  const onBackdrop = (e: MouseEvent<HTMLDialogElement>) => {
    const target = e.target;
    if (
      target === e.currentTarget ||
      !(target instanceof Element) ||
      !target.closest("img,button")
    ) {
      close();
    }
  };

  return (
    <>
      <div onClick={onOpen}>{children}</div>
      <dialog
        ref={dialogRef}
        aria-label={dialogLabel}
        onClose={close}
        onClick={onBackdrop}
        className="m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-transparent p-0 backdrop:bg-bk-ink/90 open:flex open:flex-col"
      >
        {open && (
          <>
            <div className="flex items-center justify-between px-bk-md pt-[max(var(--bk-space-sm),env(safe-area-inset-top))]">
              <button
                type="button"
                onClick={close}
                aria-label={labels.close}
                className="inline-flex h-11 w-11 items-center justify-center rounded-bk-pill bg-bk-surface text-bk-ink shadow-bk-button focus-visible:outline-none focus-visible:ring-2 ring-bk-focus order-last"
              >
                <MaterialIcon name="close" />
              </button>
              <p
                aria-live="polite"
                className="font-bk-body text-sm tabular-nums text-bk-surface"
              >
                {images[index]?.counter}
              </p>
            </div>
            <div
              ref={trackRef}
              onScroll={onScroll}
              onScrollEnd={onScrollEnd}
              onPointerDown={releaseGlide}
              onWheel={releaseGlide}
              className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ touchAction: "pan-x pinch-zoom" }}
            >
              {images.map((img, i) => (
                <div
                  key={i}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={img.counter}
                  className="flex h-full w-full shrink-0 snap-center items-center justify-center px-bk-md"
                >
                  <Image
                    src={img.url}
                    alt={img.alt}
                    width={1600}
                    height={1600}
                    sizes="(min-width: 640px) 768px, 100vw"
                    unoptimized={!isOptimizableImageHost(img.url)}
                    loading={i === index ? "eager" : "lazy"}
                    className="h-auto max-h-full w-full object-contain sm:max-w-3xl"
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-bk-md pt-bk-sm pb-[max(var(--bk-space-md),env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => go(index - 1)}
                disabled={index <= 0}
                aria-label={labels.prev}
                className={NAV_CLS}
              >
                <MaterialIcon name="arrow_back" />
              </button>
              <button
                type="button"
                onClick={() => go(index + 1)}
                disabled={index >= last}
                aria-label={labels.next}
                className={NAV_CLS}
              >
                <MaterialIcon name="arrow_forward" />
              </button>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
