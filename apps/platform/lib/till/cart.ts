/**
 * The till's cart and payment maths. Pure functions, all money in whole IQD.
 * The server recomputes every total from catalog prices (till_create_sale);
 * these only drive the screen.
 */

export interface TillVariant {
    id: string;
    name: string;
    price: number;
    barcode: string | null;
    sku: string | null;
    /** Free to sell: stock minus what open orders hold. */
    available: number;
}

export interface TillProduct {
    id: string;
    name: string;
    price: number;
    image_url: string | null;
    tag_color: string | null;
    barcode: string | null;
    sku: string | null;
    available: number;
    variants: TillVariant[];
    /** Pieces of it in the current cart, already taken off `available` (set by onShelf). */
    in_cart?: number;
}

export interface CartLine {
    key: string;
    product_id: string;
    variant_id: string | null;
    name: string;
    variant_name: string | null;
    image_url: string | null;
    /** What this line sells at; below list_price when the cashier changed it. */
    price: number;
    /** The catalog price. */
    list_price: number;
    quantity: number;
}

export const MAX_QTY = 999;

export function lineKey(productId: string, variantId: string | null): string {
    return variantId ? `${productId}:${variantId}` : productId;
}

/** Adds one of a product (or a size of it); a line already in the cart goes up by one. */
export function addToCart(cart: CartLine[], product: TillProduct, variant: TillVariant | null): CartLine[] {
    const key = lineKey(product.id, variant?.id ?? null);
    const existing = cart.find((l) => l.key === key);
    if (existing) return setQuantity(cart, key, existing.quantity + 1);
    return [
        ...cart,
        {
            key,
            product_id: product.id,
            variant_id: variant?.id ?? null,
            name: product.name,
            variant_name: variant?.name ?? null,
            image_url: product.image_url,
            price: variant ? variant.price : product.price,
            list_price: variant ? variant.price : product.price,
            quantity: 1,
        },
    ];
}

/** The catalog as this sale sees it: what is free to sell once the cart's own pieces are counted. */
export function onShelf(products: TillProduct[], cart: CartLine[]): TillProduct[] {
    if (cart.length === 0) return products;
    const byProduct = new Map<string, number>();
    const byLine = new Map<string, number>();
    for (const l of cart) {
        byProduct.set(l.product_id, (byProduct.get(l.product_id) ?? 0) + l.quantity);
        byLine.set(l.key, l.quantity);
    }
    return products.map((p) => {
        const taken = byProduct.get(p.id);
        if (!taken) return p;
        return {
            ...p,
            available: p.available - taken,
            in_cart: taken,
            variants: p.variants.map((v) => ({ ...v, available: v.available - (byLine.get(lineKey(p.id, v.id)) ?? 0) })),
        };
    });
}

/** Sets a line's quantity; 0 or less takes the line out. */
export function setQuantity(cart: CartLine[], key: string, quantity: number): CartLine[] {
    if (quantity <= 0) return cart.filter((l) => l.key !== key);
    const q = Math.min(MAX_QTY, Math.floor(quantity));
    return cart.map((l) => (l.key === key ? { ...l, quantity: q } : l));
}

/** Sells a line at a new price, between free and its catalog price. */
export function setLinePrice(cart: CartLine[], key: string, price: number): CartLine[] {
    return cart.map((l) => (l.key === key ? { ...l, price: Math.max(0, Math.min(l.list_price, Math.round(price))) } : l));
}

/** The cart at catalog prices, before any line was cut. */
export function listSubtotalOf(cart: CartLine[]): number {
    return cart.reduce((sum, l) => sum + l.list_price * l.quantity, 0);
}

/**
 * The whole discount the cashier is giving: line price cuts plus the cart discount.
 * till_create_sale checks this against the same limit.
 */
export function discountGiven(cart: CartLine[], cartDiscount: number): number {
    return listSubtotalOf(cart) - subtotalOf(cart) + cartDiscount;
}

export function subtotalOf(cart: CartLine[]): number {
    return cart.reduce((sum, l) => sum + l.price * l.quantity, 0);
}

export function itemCount(cart: CartLine[]): number {
    return cart.reduce((sum, l) => sum + l.quantity, 0);
}

/**
 * The biggest discount this cashier may give on a cart's catalog total, or null for any.
 * Mirrors till_create_sale: managers and a blank limit mean any amount.
 */
export function maxDiscount(subtotal: number, limitPct: number | null, isManager: boolean): number | null {
    if (isManager || limitPct === null) return null;
    return Math.floor((subtotal * limitPct) / 100);
}

/** Finds what a scanned or typed code points at: a size's barcode/SKU first, then a product's. */
export function findByCode(
    products: TillProduct[],
    code: string,
): { product: TillProduct; variant: TillVariant | null } | null {
    const c = code.trim().toLowerCase();
    if (!c) return null;
    for (const product of products) {
        for (const variant of product.variants) {
            if (variant.barcode?.toLowerCase() === c || variant.sku?.toLowerCase() === c) return { product, variant };
        }
    }
    for (const product of products) {
        if (product.barcode?.toLowerCase() === c || product.sku?.toLowerCase() === c) {
            // A product with sizes needs the size picked, unless it has just one.
            return { product, variant: product.variants.length === 1 ? product.variants[0] : null };
        }
    }
    return null;
}

/** Products whose name, barcode or SKU contain the search text. */
export function searchProducts(products: TillProduct[], text: string): TillProduct[] {
    const q = text.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
        (p) =>
            p.name.toLowerCase().includes(q) ||
            p.barcode?.toLowerCase().includes(q) ||
            p.sku?.toLowerCase().includes(q) ||
            p.variants.some((v) => v.name.toLowerCase().includes(q) || v.barcode?.toLowerCase().includes(q)),
    );
}

// ── Payment ──

export type PayMethod = "cash" | "card" | "zaincash" | "fib";
export const PAY_METHODS: readonly PayMethod[] = ["cash", "card", "zaincash", "fib"];

export interface PaymentLine {
    method: PayMethod;
    amount: number;
    /** Cash only: what the customer handed over for this line. */
    tendered?: number;
}

/** Iraqi dinar notes, biggest first. */
export const IQD_NOTES = [50_000, 25_000, 10_000, 5_000, 1_000, 500, 250] as const;

export function paidSoFar(lines: PaymentLine[]): number {
    return lines.reduce((sum, l) => sum + l.amount, 0);
}

export function leftToPay(total: number, lines: PaymentLine[]): number {
    return Math.max(0, total - paidSoFar(lines));
}

/** The fewest notes that make up an amount of change, e.g. 13,000 → 1×10,000 + 3×1,000. */
export function changeInNotes(change: number): { note: number; count: number }[] {
    const out: { note: number; count: number }[] = [];
    let left = Math.max(0, Math.floor(change));
    for (const note of IQD_NOTES) {
        const count = Math.floor(left / note);
        if (count > 0) {
            out.push({ note, count });
            left -= count * note;
        }
    }
    return out;
}

/**
 * The payment lines that finish a sale: what is already split off, plus the
 * rest paid by `method`. Cash needs `tendered` to cover the rest; the change is
 * what is handed back.
 */
export function finishPayment(
    total: number,
    lines: PaymentLine[],
    method: PayMethod,
    tendered: number,
): { ok: true; payments: PaymentLine[]; change: number } | { ok: false; short: number } {
    const rest = leftToPay(total, lines);
    if (rest === 0) return { ok: true, payments: lines, change: 0 };
    if (method === "cash") {
        if (tendered < rest) return { ok: false, short: rest - tendered };
        return { ok: true, payments: [...lines, { method, amount: rest, tendered }], change: tendered - rest };
    }
    return { ok: true, payments: [...lines, { method, amount: rest }], change: 0 };
}

/** Splits part of the rest off to one method, e.g. 20,000 on card, the rest later. */
export function addPartPayment(total: number, lines: PaymentLine[], method: PayMethod, amount: number): PaymentLine[] {
    const rest = leftToPay(total, lines);
    const a = Math.min(rest, Math.floor(amount));
    if (a <= 0) return lines;
    return [...lines, method === "cash" ? { method, amount: a, tendered: a } : { method, amount: a }];
}

/** Whole dinars from what a cashier types: digits only, commas allowed. */
export function parseDinars(text: string): number {
    const digits = text.replace(/[,\s]/g, "");
    return /^\d+$/.test(digits) ? Number(digits) : 0;
}

/** The locale for dates on the till: Iraqi month names in Arabic, with the same Western digits as prices. */
export function dateLocale(language: string): string {
    return language === "ar" ? "ar-IQ-u-nu-latn" : "en-GB";
}

/** The cashier's commission on their sales, in whole dinars; null when the store pays none. */
export function commissionOf(sales: number, pct: number): number | null {
    return pct > 0 ? Math.floor((sales * pct) / 100) : null;
}

export function formatIqd(n: number): string {
    return Math.round(n).toLocaleString("en-US");
}
