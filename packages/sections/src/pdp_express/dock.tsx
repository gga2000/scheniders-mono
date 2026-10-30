// =====================================================================
// The Espresso Dock (`cta_layout: "dock"`, slice 1i)
// =====================================================================
// Ali's concept A «الكبسولة» (2026-10-30): the express order buttons in one
// espresso capsule. Read from the right in Arabic: the yellow «ثبّت طلبي»
// pill with an espresso disc carrying a yellow arrow, then the cream
// «أضف للسلة» segment (with add_to_cart), a hairline, then the WhatsApp
// segment. After an add, the confirmation drawer slides out from under the
// capsule.
//
// It changes the look, never the behaviour. The pill is the form's one
// submit with the row submit's exact attributes (the id a watching sticky
// bar focuses, disabled / aria-busy / aria-describedby, the label states,
// the shine and the arrow nudge). The cart segment is the 1g tile's tap.
// WhatsApp is the same link with the same accessible name. DOM order is
// today's row's (WhatsApp, cart, submit) in an LTR flex, which paints the
// yellow at the right, where Arabic reading starts.
//
// Colours (D4): solid yellow only on the pill; the disc's arrow is yellow
// on espresso; the WhatsApp glyph is a softened green, the drawer's check
// a success green. Sizes: capsule 64px (4px padding), pill 56px, disc
// 44px, segments 62px (WhatsApp) and 72px (cart) wide, labels 12px. The
// heights are minimums, so a long label wraps and the capsule grows; the
// yellow label is never truncated.
// =====================================================================

import { cn } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { MaterialIcon, WhatsAppOutlineIcon } from "../helpers/primitives";
import type { CartAddOutcome, CartNote } from "./cart-action";
import { DockCartSegment } from "./dock-cart";
import { DockDrawer } from "./dock-drawer";
import { DockArrowIcon } from "./dock-icons";
import { DOCK_LABEL, DOCK_SEGMENT, DockStyle } from "./dock-style";
import type { ExpressModel } from "./model";
import { readsRtl, xs } from "./text";

export function ExpressDock({
  m,
  locale,
  waHref,
  submitId,
  submitLabel,
  cart,
  note,
  onAdded,
}: {
  m: ExpressModel;
  locale: LocaleCode;
  /** The WhatsApp order link, or null for no WhatsApp segment. */
  waHref: string | null;
  /** The id a watching form-aware sticky bar focuses; undefined otherwise. */
  submitId: string | undefined;
  submitLabel: string;
  /** add_to_cart is on and the product can be ordered. */
  cart: boolean;
  /** The last cart tap's outcome: the badge and the drawer. */
  note: CartNote | null;
  onAdded: (outcome: CartAddOutcome) => void;
}) {
  const rtl = readsRtl(locale);
  const idle = !m.oos && !m.submitting;

  return (
    <div data-layer="submit" data-layer-label="Order buttons" data-cta-layout="dock" className="pb-2">
      <DockStyle />
      <div className="bk-xp-dock relative z-[1] flex min-h-16 items-stretch gap-0.5 rounded-[32px] bg-bk-secondary p-1">
        {waHref && (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={xs("whatsapp", locale)}
            className={cn(DOCK_SEGMENT, "w-[62px]")}
          >
            <WhatsAppOutlineIcon className="bk-xp-dock-wa block h-[21px] w-[21px]" />
            <span className={DOCK_LABEL}>{xs("whatsappShort", locale)}</span>
          </a>
        )}
        {cart && <DockCartSegment m={m} locale={locale} note={note} onAdded={onAdded} />}
        <button
          type="submit"
          id={submitId}
          disabled={m.oos || m.submitting}
          aria-busy={m.submitting || undefined}
          aria-describedby={
            m.status === "error" || m.status === "unconfirmed" ? m.submitErrorId : undefined
          }
          className={cn(
            "bk-xp-dock-order relative isolate flex min-h-14 min-w-0 flex-1 items-center gap-2.5 overflow-hidden rounded-[28px] bg-bk-primary py-1.5 text-bk-on-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bk-secondary",
            "disabled:cursor-not-allowed disabled:bg-bk-primary-disabled",
            idle && "hover:bg-bk-primary-hover",
            m.submitting && "cursor-progress",
            m.oos ? "justify-center px-5" : cn("justify-between", rtl ? "pl-1.5 pr-[22px]" : "pl-[22px] pr-1.5"),
            rtl && "bk-xp-dock-rtl flex-row-reverse",
          )}
        >
          {idle && (
            <span
              aria-hidden="true"
              className={cn(
                "bk-xp-sheen pointer-events-none absolute inset-y-0 left-0 -z-10 w-2/5",
                rtl && "bk-xp-sheen-rtl",
              )}
            />
          )}
          <span className="min-w-0 font-bk-display text-[20px] font-black leading-[1.1] tracking-[-0.01em]">
            {submitLabel}
          </span>
          {!m.oos && (
            <span
              aria-hidden="true"
              className="bk-xp-dock-disc flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bk-secondary text-bk-primary"
            >
              {m.submitting ? (
                <MaterialIcon
                  name="progress_activity"
                  className="animate-spin text-xl motion-reduce:animate-none"
                />
              ) : (
                <DockArrowIcon rtl={rtl} className={cn("block h-5 w-5", rtl ? "bk-xp-nudge-rtl" : "bk-xp-nudge")} />
              )}
            </span>
          )}
        </button>
      </div>
      {cart && <DockDrawer note={note} locale={locale} />}
    </div>
  );
}
