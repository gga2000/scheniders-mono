// =====================================================================
// sticky_cta_bar — the soft style and the icon secondary (spec §1.8)
// =====================================================================
// `style: "soft"` draws the bar the way the express form draws «ثبّت طلبي»:
// a token-radius yellow button with the token button shadow and no ink
// outline (issue I14), on a plain surface bar with a hairline. The price
// sits on the bar's surface beside it, struck price in red (D4), nothing
// under 12px. `secondary_display: "icon"` is a 52px square: the WhatsApp
// glyph in green (D4: green is for WhatsApp) or the call glyph in ink.
// Yellow fills only the primary (D4: the two order actions).
// =====================================================================

import type { LocaleCode } from "@scheniders/shared";
import type { ExpressFormStage } from "./helpers/express-order-store";
import { formatPrice } from "./helpers/format";
import { MaterialIcon, WhatsAppIcon } from "./helpers/primitives";
import { cn } from "./helpers/utils";

const PRIMARY_CLS =
  "flex min-h-[54px] flex-1 flex-col items-center justify-center rounded-bk-input bg-bk-primary px-4 py-1.5 text-bk-on-primary shadow-bk-button transition-[transform,background-color] duration-bk-fast hover:bg-bk-primary-hover active:scale-[0.97] active:bg-bk-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bk-surface motion-reduce:transition-none";

/** The yellow primary: one big line and, in the form-aware states that have
 *  one, a small line under it. A link when `href` is set, else a button. */
export function SoftPrimary({
  label,
  sub,
  stage,
  rtl,
  href,
  onClick,
}: {
  label: string;
  sub: string | null;
  /** The form-aware state, or null when the bar is not form-aware. */
  stage: ExpressFormStage | null;
  rtl: boolean;
  href: string | null;
  onClick?: () => void;
}) {
  const complete = stage === "complete";
  const body = (
    <>
      <span
        className={cn(
          "flex items-center gap-1.5 font-bk-display text-[17px] font-black leading-tight",
          rtl && "flex-row-reverse",
        )}
      >
        {complete && <MaterialIcon name="check" className="text-lg" />}
        {label}
      </span>
      {sub && <span className="font-bk-body text-xs font-bold leading-tight text-bk-on-primary/80">{sub}</span>}
    </>
  );
  const className = cn(PRIMARY_CLS, complete && "ring-2 ring-bk-secondary");
  if (href) {
    return (
      <a href={href} className={className} data-sticky-primary="link">
        {body}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} data-sticky-primary={stage ?? "scroll"}>
      {body}
    </button>
  );
}

/** The product price on the bar's surface: struck before-price in red over
 *  the current price, both at or above the 12px floor. */
export function SoftPrice({
  price,
  compareAt,
  locale,
}: {
  price: number;
  compareAt: number | null;
  locale: LocaleCode;
}) {
  const onSale = compareAt != null && compareAt > price;
  return (
    <div className="flex shrink-0 flex-col items-center leading-tight tabular-nums" data-product-price>
      {onSale && (
        <s className="font-bk-body text-xs font-semibold text-bk-ink-faint decoration-bk-danger">
          <bdi>{formatPrice(compareAt, locale)}</bdi>
        </s>
      )}
      <span className="whitespace-nowrap font-bk-display text-[17px] font-black text-bk-ink">
        <bdi>{formatPrice(price, locale)}</bdi>
      </span>
    </div>
  );
}

const SQUARE_CLS =
  "flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-bk-input border border-bk-divider bg-bk-surface transition-transform duration-bk-fast active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus motion-reduce:transition-none";

/** The 52px square: WhatsApp (green glyph) or call (ink glyph). */
export function IconSecondary({
  href,
  kind,
  name,
}: {
  href: string;
  kind: "whatsapp" | "call";
  /** The accessible name: «راسلنا واتساب» / «اتصل بينا». */
  name: string;
}) {
  const whatsapp = kind === "whatsapp";
  return (
    <a
      href={href}
      target={whatsapp ? "_blank" : undefined}
      rel={whatsapp ? "noopener noreferrer" : undefined}
      aria-label={name}
      className={cn(SQUARE_CLS, whatsapp ? "text-bk-success" : "text-bk-ink")}
      data-sticky-secondary="icon"
    >
      {whatsapp ? (
        <WhatsAppIcon shadow={false} className="h-7 w-7" />
      ) : (
        <MaterialIcon name="call" className="text-2xl" />
      )}
    </a>
  );
}

/** The labelled secondary in the soft style: the express form's soft green
 *  tile (WhatsApp) or an outlined ink tile (call). */
export function SoftSecondary({
  href,
  kind,
  label,
  rtl,
}: {
  href: string;
  kind: "whatsapp" | "call";
  label: string;
  rtl: boolean;
}) {
  const whatsapp = kind === "whatsapp";
  return (
    <a
      href={href}
      target={whatsapp ? "_blank" : undefined}
      rel={whatsapp ? "noopener noreferrer" : undefined}
      className={cn(
        "flex min-h-[52px] shrink-0 items-center gap-1.5 rounded-bk-input px-3 font-bk-body text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus",
        whatsapp
          ? "border border-bk-success/25 bg-bk-success/10 text-bk-success"
          : "border border-bk-divider bg-bk-surface text-bk-ink",
        rtl && "flex-row-reverse",
      )}
      data-sticky-secondary="button"
    >
      {whatsapp ? <WhatsAppIcon shadow={false} className="h-6 w-6" /> : <MaterialIcon name="call" className="text-xl" />}
      {label}
    </a>
  );
}
