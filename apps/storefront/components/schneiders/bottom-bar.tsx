"use client";

import { StoreLink } from "@/lib/store-context";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { MaterialIcon, WhatsAppIcon } from "./primitives";

interface Props {
  /** WhatsApp number in E.164 (e.g. +9647700000000) — pulled from tenant config in pages. */
  whatsapp?: string | null;
  /** Optional message prefilled into WhatsApp deeplink. */
  whatsappMessage?: string;
  /** Phone number for call CTA. */
  phone?: string | null;
  /** Left-side content (e.g. total price). When omitted, shows a generic CTA. */
  left?: ReactNode;
  /** Optional right-side CTA override (defaults to "ORDER NOW"). */
  cta?: ReactNode;
  /** Override the green pill color (e.g. checkout uses "pink"). */
  variant?: "mint" | "pink";
}

export function StickyBottomBar({
  whatsapp,
  whatsappMessage,
  phone,
  left,
  cta,
  variant = "mint",
}: Props) {
  const bg = variant === "pink" ? "bg-bk-primary" : "bg-bk-success";
  const waHref = whatsapp
    ? `https://wa.me/${whatsapp.replace(/\D/g, "")}${whatsappMessage ? `?text=${encodeURIComponent(whatsappMessage)}` : ""}`
    : null;
  const callHref = phone ? `tel:${phone.replace(/\s/g, "")}` : null;

  return (
    <div
      className={cn(
        "fixed bottom-0 inset-x-0 z-50 border-t-4 border-bk-ink shadow-[0_-4px_0_0_rgba(26,26,26,1)] pb-safe",
        bg,
      )}
    >
      <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between gap-3">
        {left ? (
          <div className="flex flex-col min-w-0">{left}</div>
        ) : (
          <div className="flex items-center gap-2">
            {callHref && (
              <a
                aria-label="Call us"
                href={callHref}
                className="w-12 h-12 bento-card-sm bg-white text-bk-ink flex items-center justify-center hover:scale-105 active:scale-95 transition-transform rounded-xl shrink-0"
              >
                <MaterialIcon name="call" />
              </a>
            )}
          </div>
        )}

        <div className="flex gap-2 items-center">
          {cta ?? (
            <a
              href={waHref ?? "#"}
              target={waHref ? "_blank" : undefined}
              rel={waHref ? "noreferrer" : undefined}
              className="bento-card bg-white text-bk-ink font-display font-black text-base sm:text-lg px-5 py-3 flex items-center gap-2 hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none active:translate-y-[2px] active:translate-x-[2px] transition-all rounded-xl uppercase tracking-tight"
            >
              <WhatsAppIcon className="w-5 h-5 text-bk-ink" />
              Order Now
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/** Convenience CTA used inside a bottom bar (e.g. checkout "PLACE ORDER" button) */
export function BottomBarCta({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}) {
  return (
    <StoreLink
      href={href}
      className="bento-card bg-white text-bk-ink font-display font-black text-base px-5 py-3 inline-flex items-center gap-2 hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none active:translate-y-[2px] active:translate-x-[2px] transition-all rounded-xl uppercase tracking-tight"
    >
      {children}
    </StoreLink>
  );
}
