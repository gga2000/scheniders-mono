// Express add to cart (`add_to_cart`, slice 1g): the «أضف للسلة» tile that
// sits between the WhatsApp tile and the submit, and the line under the
// order buttons that confirms an add and links to the cart.
//
// The tile is a `type="button"` inside the order form: it never submits
// the order and never runs the form's validation. It adds what the form
// would order — the chosen variant and the stepper's quantity at the
// receipt's unit price — or, while a variant is still owed, asks for it
// exactly as a submit would. The AddToCart pixel fires as on
// pdp_add_to_cart; in draft view no pixel and no funnel sink is installed
// (storefront layout / v2-page), so the call records nothing there.
//
// Colours (D4): the tile is an ink outline on the surface — yellow fills
// stay on the order actions; the confirmation's check is the success green.

import { cn, pixelContentsFromItems } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { useCart } from "../helpers/cart-store";
import { trackPixel } from "../helpers/pixels";
import { MaterialIcon } from "../helpers/primitives";
import { StoreLink } from "../helpers/store-context";
import { expressCartLine } from "./cart-line";
import type { ExpressModel } from "./model";
import { readsRtl, xs } from "./text";

export function CartTile({
  m,
  locale,
  onAdded,
}: {
  m: ExpressModel;
  locale: LocaleCode;
  /** Called after each add, for the confirmation line. */
  onAdded: () => void;
}) {
  const addItem = useCart((s) => s.addItem);

  function add() {
    if (m.chosen.needsVariant) {
      m.focusVariantChoice();
      return;
    }
    const line = expressCartLine({
      product: m.product,
      variant: m.chosen.variant,
      qty: m.qty,
      price: m.price,
      unitPrice: m.unitPrice,
    });
    addItem(line);
    trackPixel(
      "AddToCart",
      pixelContentsFromItems([{ product_id: line.product_id, price: line.price, quantity: line.quantity }]),
    );
    onAdded();
  }

  return (
    <button
      type="button"
      onClick={add}
      disabled={m.submitting}
      data-cart-add=""
      className="flex w-[84px] shrink-0 flex-col items-center justify-center gap-1 rounded-bk-input border-bk border-bk-ink bg-bk-surface px-1.5 text-bk-ink transition-[transform,background-color] duration-bk-fast hover:bg-bk-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
    >
      <MaterialIcon name="shopping_bag" className="text-[22px] leading-none" />
      <span className="text-center font-bk-body text-xs font-bold leading-tight">{xs("addToCart", locale)}</span>
    </button>
  );
}

/** The confirmation under the order buttons. The live region is always in
 *  the row (a region inserted with its text is often not announced); the
 *  text is keyed by the add count so a second add is announced again. */
export function CartAddedStatus({ adds, locale }: { adds: number; locale: LocaleCode }) {
  const rtl = readsRtl(locale);
  return (
    <p role="status" data-cart-status="" className="basis-full font-bk-body text-[13px] text-bk-ink">
      {adds > 0 && (
        <span key={adds} className={cn("flex items-center justify-center gap-1.5", rtl && "flex-row-reverse")}>
          <MaterialIcon name="check_circle" className="text-base text-bk-success" />
          <span className="font-bold">{xs("addedToCart", locale)}</span>
          <StoreLink
            href="/cart"
            className="inline-flex min-h-11 items-center px-1 font-bold text-bk-ink underline underline-offset-4"
          >
            {xs("viewCart", locale)}
          </StoreLink>
        </span>
      )}
    </p>
  );
}
