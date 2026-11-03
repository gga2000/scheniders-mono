import type { Product } from "../types";

/** The name a product card shows: the merchant's short public name
 *  (products.display_name) when set, else the full marketing name. The full
 *  name stays the image alt and the SEO title; a card only has two lines,
 *  and «عطر برسيفيرون الفاخر من باريس كورنر للرجال» was cut to «...». */
export function cardName(product: Pick<Product, "name" | "display_name">): string {
  return product.display_name?.trim() || product.name;
}
