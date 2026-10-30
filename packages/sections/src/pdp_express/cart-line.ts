// The cart line the express «أضف للسلة» tile adds: the chosen variant and
// quantity, priced exactly as the express receipt prices them, carrying the
// base price and ladder so the cart re-prices a quantity change the way
// the checkout server will (helpers/cart-store `repriced`).
//
// The name is the one the express page shows (`displayNameOf`): the cart
// and checkout pages print `name`, while the order itself snapshots the
// catalogue's own name server-side (app/actions/checkout.ts), so the cart's
// copy is display-only. An accepted order bump is not added: the cart
// offers no bumps, and the bump's discount is only valid beside its parent
// in the same direct order.

import type { CartItem } from "@scheniders/shared";
import type { ProductVariant } from "../types";
import { displayNameOf } from "./identity-label";
import type { ExpressModel } from "./model";

export type CartLineInput = Pick<ExpressModel, "product" | "qty" | "price" | "unitPrice"> & {
  /** The variant being bought, or null for a plain product. */
  variant: ProductVariant | null;
};

export function expressCartLine({ product, variant, qty, price, unitPrice }: CartLineInput): CartItem {
  return {
    product_id: product.id,
    variant_id: variant?.id ?? null,
    name: displayNameOf(product),
    variant_name: variant?.name ?? null,
    price: unitPrice,
    quantity: qty,
    image_url: variant?.image_url ?? product.image_url ?? null,
    base_price: price,
    ...(product.price_tiers ? { price_tiers: product.price_tiers } : {}),
  };
}
