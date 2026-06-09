"use client";

import { useEffect } from "react";

/**
 * One-way scroll reveal for storefront sections.
 *
 * Replaces the old scroll-LINKED CSS (`animation-timeline: view()`), which
 * tied each section's opacity to scroll position — so scrolling back up
 * re-hid sections and any section whose range never completed got stuck at
 * opacity 0 (sections "disappearing" while scrolling).
 *
 * Here the reveal is triggered ONCE by an IntersectionObserver and then
 * persists. Safety guarantees so a section can never be left hidden:
 *  - No JS / no IntersectionObserver → nothing runs, sections stay visible.
 *  - OS or tenant (`data-bk-motion="reduce"`) reduced-motion → skipped.
 *  - Sections already in view at mount are revealed immediately (no jump).
 *  - Only below-the-fold sections get the hidden `reveal-init` state, and
 *    those aren't painted yet (content-visibility), so there's no flash.
 *  - A short safety timeout reveals anything still pending (e.g. a section
 *    the observer never fired for), so the page can never strand content.
 */
export function SectionReveal() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const tenantReduced =
      document
        .querySelector("[data-bk-motion]")
        ?.getAttribute("data-bk-motion") === "reduce";
    if (prefersReduced || tenantReduced || !("IntersectionObserver" in window)) {
      return;
    }

    const sections = Array.from(
      document.querySelectorAll<HTMLElement>(".schn-section"),
    );
    if (sections.length === 0) return;

    const reveal = (el: HTMLElement) => {
      el.classList.remove("reveal-init");
      el.classList.add("reveal-in");
    };

    const io = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            reveal(entry.target as HTMLElement);
            obs.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.04 },
    );

    const pending: HTMLElement[] = [];
    const foldLine = window.innerHeight * 0.92;
    for (const el of sections) {
      // Already in (or just below) view at mount: reveal now, no animation jump.
      if (el.getBoundingClientRect().top < foldLine) {
        reveal(el);
        continue;
      }
      el.classList.add("reveal-init");
      pending.push(el);
      io.observe(el);
    }

    // Safety net: never strand a section hidden if its observer never fires.
    const safety = window.setTimeout(() => {
      for (const el of pending) {
        if (el.classList.contains("reveal-init")) reveal(el);
      }
    }, 4000);

    return () => {
      io.disconnect();
      window.clearTimeout(safety);
    };
  }, []);

  return null;
}
