import type { PriceTier } from "../price-tiers";

export interface CartItem {
  product_id: string;
  variant_id: string | null;
  name: string;
  variant_name: string | null;
  /** Unit price as shown, after any quantity break. What the shopper pays. */
  price: number;
  quantity: number;
  image_url: string | null;
  /**
   * Unit price before any quantity break.
   *
   * Carried so the cart can re-apply a merchant's price ladder when the
   * shopper changes the quantity in the cart, which it previously could not:
   * the line kept the price it was added at, the checkout recomputed the
   * ladder for the new quantity, and the difference surfaced as "prices
   * changed" on a first submit when nothing had. Repricing always starts from
   * this value, never from `price`, so it can never compound.
   *
   * Optional: a cart persisted before this existed has no base to work from
   * and is left exactly as it is.
   */
  base_price?: number;
  /**
   * The product's quantity ladder, denormalised at add-to-cart.
   *
   * The cart and checkout pages fetch no products, so the ladder has to travel
   * with the line. The server re-resolves it from the catalogue regardless —
   * this copy only keeps the displayed price honest between page loads, and a
   * ladder the merchant edits afterwards is corrected at submit.
   */
  price_tiers?: PriceTier[];
}

export interface CheckoutFormData {
  customer_name: string;
  phone: string;
  governorate_code: string;
  city: string;
  address_details: string;
  notes?: string;
}
