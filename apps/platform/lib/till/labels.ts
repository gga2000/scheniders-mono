/**
 * Barcode stickers: one 50 × 30 mm label per bottle, for a label printer roll.
 * Printed documents may be right to left; the app itself stays LTR.
 */
import { escapeHtml } from "@/lib/html-escape";
import { code128Svg } from "@/lib/print-codes";
import { lineKey, type TillProduct } from "./cart";
import { formatIqdNumber } from "@scheniders/shared";

export interface LabelLine {
    key: string;
    product_id: string;
    variant_id: string | null;
    name: string;
    variant_name: string | null;
    image_url: string | null;
    price: number;
    barcode: string | null;
    on_hand: number;
}

/** One line per size (or per product with no sizes), each with its own code. */
export function labelLines(products: TillProduct[]): LabelLine[] {
    return products.flatMap((p): LabelLine[] =>
        p.variants.length
            ? p.variants.map((v) => ({
                  key: lineKey(p.id, v.id),
                  product_id: p.id,
                  variant_id: v.id,
                  name: p.name,
                  variant_name: p.variants.length > 1 ? v.name : null,
                  image_url: p.image_url,
                  price: v.price,
                  barcode: v.barcode?.trim() || null,
                  on_hand: v.on_hand,
              }))
            : [
                  {
                      key: lineKey(p.id, null),
                      product_id: p.id,
                      variant_id: null,
                      name: p.name,
                      variant_name: null,
                      image_url: p.image_url,
                      price: p.price,
                      barcode: p.barcode?.trim() || null,
                      on_hand: p.on_hand,
                  },
              ],
    );
}

export interface Sticker {
    name: string;
    variant_name: string | null;
    price: number;
    barcode: string;
    copies: number;
}

/** The print document: each sticker repeated `copies` times, one per label. */
export function labelSheetHtml(storeName: string, stickers: Sticker[]): string {
    const one = (s: Sticker) => {
        const name = s.variant_name ? `${s.name} ${s.variant_name}` : s.name;
        return `<section class="label">
<div class="top"><span class="name">${escapeHtml(name)}</span><span class="price"><span class="num">${escapeHtml(formatIqdNumber(s.price))}</span> د.ع</span></div>
<div class="code">${code128Svg(s.barcode, { heightMm: 11, maxWidthMm: 46 })}</div>
<div class="foot"><span class="num">${escapeHtml(s.barcode)}</span><span>${escapeHtml(storeName)}</span></div>
</section>`;
    };
    const body = stickers.flatMap((s) => Array.from({ length: Math.max(0, s.copies) }, () => one(s))).join("\n");
    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(storeName)}</title>
<style>
  @page { size: 50mm 30mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Tahoma, Arial, sans-serif; color: #000; background: #fff; }
  .label { width: 50mm; height: 30mm; padding: 2mm 2mm 1.5mm; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; page-break-after: always; break-after: page; }
  .label:last-child { page-break-after: auto; break-after: auto; }
  .top { display: flex; justify-content: space-between; align-items: baseline; gap: 2mm; }
  .name { font-size: 9pt; font-weight: 700; line-height: 1.15; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .price { font-size: 9pt; font-weight: 700; white-space: nowrap; }
  .code { display: flex; justify-content: center; }
  .code svg { display: block; }
  .foot { display: flex; justify-content: space-between; font-size: 6.5pt; }
  .num { direction: ltr; unicode-bidi: isolate; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}
