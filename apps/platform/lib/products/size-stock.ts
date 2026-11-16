import type { Product } from "@/types/product";

/**
 * A product sold in sizes keeps its stock on its sizes: an order reserves and
 * takes the size's units, a return or a count puts them back on the size, and
 * nothing moves the product's own row (Fermi B10). The products screens read
 * the stock, the reserved units and the open-box units of such a product as
 * the sum over its enabled sizes, so a shirt with 12 left in M is never shown
 * as sold out, and its health score counts what is really on the shelf.
 *
 * `stock_by_size` tells a screen not to offer a product-level stock change for
 * it: that would move a number nothing sells from.
 */
export function withSizeStock(product: Product): Product {
    const sizes = (product.variants ?? []).filter((v) => v.is_enabled !== false);
    if (sizes.length === 0) return product;
    let stock = 0;
    let reserved = 0;
    let openBox = 0;
    for (const size of sizes) {
        stock += size.stock_quantity ?? 0;
        reserved += size.reserved_quantity ?? 0;
        openBox += size.open_box_quantity ?? 0;
    }
    return {
        ...product,
        stock_quantity: stock,
        reserved_quantity: reserved,
        open_box_quantity: openBox,
        stock_by_size: true,
    };
}
