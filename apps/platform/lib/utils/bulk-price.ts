interface PricedProduct {
    compare_at_price?: number | null;
    website_price?: number | null;
}

/**
 * The price a bulk change leaves on the website: the new price, unless the
 * product keeps its own website price.
 */
export function websitePriceAfterBulk(p: PricedProduct, newPrice: number, alsoWebsite: boolean): number {
    return !alsoWebsite && p.website_price != null ? p.website_price : newPrice;
}

/**
 * A "was" price at or below the price the customer will see would show a fake
 * discount, so a bulk price change clears it.
 */
export function clearsCompareAt(p: PricedProduct, newPrice: number, alsoWebsite: boolean): boolean {
    return p.compare_at_price != null && p.compare_at_price <= websitePriceAfterBulk(p, newPrice, alsoWebsite);
}
