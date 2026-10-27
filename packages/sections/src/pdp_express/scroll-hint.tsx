"use client";

// Express scroll hint: a small floating pill at the bottom of the first
// screen telling shoppers who do not think to scroll (often older ones)
// that the order form is below. It appears a moment after load only if the
// page has not moved and the form's first field is not already on screen
// (a visible field is its own pointer). It never sits on the form: when the
// form's start already peeks above the pill's spot — a short phone where
// the heading shows but the field does not — the pill lifts to end just
// above the form, and with no room for that it stays away. It leaves on the
// first scroll or the first focus inside the page, and never comes back in
// that page view. Tapping it glides to the order form (a jump when the
// device or the tenant has motion off).
//
// The pill is portalled to the tenant root (the [data-bk-motion] element
// that carries the brand-kit tokens and the tenant motion switch), so a
// transformed or contained ancestor — the section's scroll reveal, a lazy
// section's content-visibility — can never become its containing block
// and drag it off-screen. Outside a tenant root it renders in place.
//
// Server markup is empty: the pill only exists after the client decides to
// show it, so it costs the first paint nothing and never flashes for a
// shopper who arrives mid-page.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@scheniders/shared";
import { MaterialIcon } from "../helpers/primitives";

/** How long the page sits still before the hint shows. */
export const SCROLL_HINT_DELAY_MS = 1200;

type Phase = "waiting" | "shown" | "gone";

/** The tenant root: carries the --bk-* tokens and data-bk-motion. */
function tenantRoot(from: Element | null): HTMLElement | null {
  return from?.closest<HTMLElement>("[data-bk-motion]") ?? null;
}

/** Motion off on the device or by the tenant's brand-kit switch. */
function motionReduced(root: HTMLElement | null): boolean {
  return (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    root?.getAttribute("data-bk-motion") === "reduce"
  );
}

/** Where the pill goes, measured with the pill laid out at its default
 *  spot (`band` = its fixed bottom wrapper): "gone" when the form's first
 *  field is already fully on screen or there is no room above the form,
 *  "default" when the form starts below the pill, else the bottom offset
 *  (px) that ends the band — its own bottom padding included — at the
 *  form's top. The pill's edge comes from layout offsets, not its rect, so
 *  the entrance animation's transform never skews the answer. */
export function placeScrollHint(
  form: HTMLElement | null,
  band: HTMLElement | null,
): "gone" | "default" | number {
  const pill = band?.querySelector<HTMLElement>("button");
  if (!form || !band || !pill) return "default";
  const field = form.querySelector<HTMLElement>("input, select, textarea")?.getBoundingClientRect();
  // A zero-height field is not laid out (hidden), so not seen either.
  if (field && field.height > 0 && field.top >= 0 && field.bottom <= window.innerHeight) {
    return "gone";
  }
  const bandRect = band.getBoundingClientRect();
  const pillBottom = bandRect.top + pill.offsetTop + pill.offsetHeight;
  const formTop = form.getBoundingClientRect().top;
  if (formTop >= pillBottom) return "default";
  // Lift the band so it ends at the form's top; it must still fit on screen.
  if (formTop - bandRect.height < 0) return "gone";
  return bandRect.bottom - formTop;
}

export function ScrollHint({
  label,
  targetId,
  rtl,
}: {
  label: string;
  /** id of the element the tap scrolls to (the order form). */
  targetId: string;
  rtl: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("waiting");
  // Where the pill mounts: the tenant root, or in place (null) outside one.
  const [host, setHost] = useState<HTMLElement | null>(null);
  // Bottom offset (px) when the pill lifts above a form that peeks on screen.
  const [lift, setLift] = useState<number | null>(null);
  const hintRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (phase === "gone") return;
    // Arriving mid-page (restored scroll, an anchor) is "already scrolled".
    if (window.scrollY > 0) {
      setPhase("gone");
      return;
    }
    const dismiss = () => setPhase("gone");
    // Focus inside the page means the shopper is engaged; focus on the pill
    // itself (keyboard) is the one exception.
    const onFocusIn = (e: FocusEvent) => {
      if (e.target instanceof Node && hintRef.current?.contains(e.target)) return;
      dismiss();
    };
    window.addEventListener("scroll", dismiss, { passive: true });
    document.addEventListener("focusin", onFocusIn);
    const timer =
      phase === "waiting"
        ? window.setTimeout(() => {
            setHost(tenantRoot(document.getElementById(targetId)));
            const skip = window.scrollY > 0;
            // "gone" is terminal: a dismissal queued in the same tick wins.
            setPhase((cur) => (cur === "gone" || skip ? "gone" : "shown"));
          }, SCROLL_HINT_DELAY_MS)
        : null;
    return () => {
      window.removeEventListener("scroll", dismiss);
      document.removeEventListener("focusin", onFocusIn);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [phase, targetId]);

  // Measured once the pill is laid out and before it paints, so it never
  // flashes over the form: it leaves, lifts, or stays where it is.
  useLayoutEffect(() => {
    if (phase !== "shown") return;
    const place = placeScrollHint(document.getElementById(targetId), hintRef.current);
    if (place === "gone") setPhase("gone");
    else if (place !== "default") setLift(place);
  }, [phase, targetId]);

  if (phase !== "shown") return null;

  function goToForm() {
    document.getElementById(targetId)?.scrollIntoView({
      behavior: motionReduced(tenantRoot(hintRef.current)) ? "auto" : "smooth",
      block: "start",
    });
    setPhase("gone");
  }

  const pill = (
    <div
      ref={hintRef}
      data-scroll-hint
      style={lift === null ? undefined : { bottom: lift }}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(var(--bk-space-md),env(safe-area-inset-bottom))]"
    >
      <button
        type="button"
        onClick={goToForm}
        className={cn(
          "pointer-events-auto flex min-h-12 items-center gap-2 rounded-bk-pill bg-bk-ink py-1.5 font-bk-body text-sm font-bold text-bk-surface shadow-bk-card",
          "transition-transform duration-bk-fast active:scale-95 motion-reduce:transition-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus",
          "motion-safe:animate-[bk-fade-up_var(--bk-duration-reveal)_ease-out_both]",
          rtl ? "flex-row-reverse pl-4 pr-1.5" : "pl-1.5 pr-4",
        )}
      >
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-bk-pill bg-bk-surface/15"
        >
          <MaterialIcon name="keyboard_double_arrow_down" className="bk-xp-drop text-xl" />
        </span>
        <span>{label}</span>
      </button>
    </div>
  );
  return host ? createPortal(pill, host) : pill;
}
