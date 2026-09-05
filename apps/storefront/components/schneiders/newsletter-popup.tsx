"use client";

import { useEffect, useState } from "react";
import type { NewsletterPopupConfig } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { BentoCard, ChunkyButton, MaterialIcon, Sticker } from "./primitives";
import { formatPrice } from "./format";

const STORAGE_KEY = "schneiders-newsletter-dismissed";

/**
 * Bottom-anchored newsletter modal — shows once per browser after the
 * configured delay (or page count). Dismissal is sticky in localStorage.
 */
export function SchneidersNewsletterPopup({ config }: { config: NewsletterPopupConfig | undefined }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const enabled = !!config?.enabled;
  const delayMs = Math.max(1, (config?.popup_after_seconds ?? 30)) * 1000;

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      // localStorage disabled — fall back to showing once per session
    }
    const t = window.setTimeout(() => setOpen(true), delayMs);
    return () => window.clearTimeout(t);
  }, [enabled, delayMs]);

  if (!enabled) return null;

  function dismiss() {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      /* noop */
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitted(true);
    setTimeout(() => {
      dismiss();
    }, 1800);
  }

  const discount = config?.discount_iqd ?? 0;
  const label = config?.label ?? (discount > 0 ? `Get ${formatPrice(discount)} off your first order` : "Stay in the loop");

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-end justify-center sm:items-center transition-opacity",
        open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
      )}
      aria-hidden={!open}
    >
      <button
        type="button"
        aria-label="Close newsletter popup"
        onClick={dismiss}
        className="absolute inset-0 bg-bk-ink/50 backdrop-blur-sm cursor-pointer text-bk-surface"
      />

      <BentoCard
        bg="white"
        rotate={-1}
        className={cn(
          "relative m-4 max-w-md w-full p-6 z-10 transition-transform",
          open ? "translate-y-0" : "translate-y-8",
        )}
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute -top-3 -right-3 w-9 h-9 rounded-full bento-card-sm bg-bk-accent flex items-center justify-center hover:scale-105 active:scale-95 transition-transform text-bk-on-accent"
        >
          <MaterialIcon name="close" className="text-lg" />
        </button>

        {submitted ? (
          <div className="text-center py-4">
            <div className="text-5xl mb-3" style={{ transform: "rotate(-6deg)" }}>🎉</div>
            <h3 className="font-display font-black text-2xl uppercase mb-2">You're in!</h3>
            <p className="font-body text-sm text-bk-ink/80">
              Check your inbox in a sec for the code.
            </p>
          </div>
        ) : (
          <>
            <Sticker bg="pink" rotate={-6} size="xs" className="mb-3">
              ✨ Exclusive
            </Sticker>
            <h3 className="font-display font-black text-2xl uppercase leading-tight">{label}</h3>
            <p className="font-body text-sm text-bk-ink/80 mt-2 mb-4">
              Drop your email and we'll send you the code.
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bento-card-sm bg-bk-surface rounded-xl px-4 py-3 font-body font-bold text-base focus:outline-none placeholder:opacity-50"
              />
              <ChunkyButton type="submit" bg="pink" fullWidth>
                Send me the code <MaterialIcon name="arrow_forward" />
              </ChunkyButton>
            </form>
            <button
              type="button"
              onClick={dismiss}
              className="mt-3 w-full text-center text-xs font-display font-bold uppercase text-bk-ink/60 hover:text-bk-ink"
            >
              No thanks
            </button>
          </>
        )}
      </BentoCard>
    </div>
  );
}
