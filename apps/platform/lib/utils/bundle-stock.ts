import type { Product } from "@/types/product";

export interface BundleItem {
    child_product_id: string;
    quantity: number;
    name?: string;
    price?: number;
    image_url?: string;
}

export interface BundleComponentStock {
    productId: string;
    productName: string;
    availableStock: number;
    requiredPerBundle: number;
    possibleBundles: number;
    isLimiting: boolean;
    isBelowThreshold: boolean;
}

export interface BundleStockResult {
    availableBundles: number;
    limitingComponent: BundleComponentStock | null;
    components: BundleComponentStock[];
    hasStockWarning: boolean;
}

/**
 * Calculate how many complete bundles can be assembled from component stock.
 * For each component: possibleBundles = floor(componentStock / quantityPerBundle)
 * Available bundles = min(possibleBundles) across all components.
 */
export function calculateBundleStock(
    bundleItems: BundleItem[],
    allProducts: Product[]
): BundleStockResult {
    if (bundleItems.length === 0) {
        return {
            availableBundles: 0,
            limitingComponent: null,
            components: [],
            hasStockWarning: false,
        };
    }

    const productsMap = new Map(allProducts.map((p) => [p.id, p]));

    const components: BundleComponentStock[] = bundleItems.map((item) => {
        const product = productsMap.get(item.child_product_id);
        const availableStock = product
            ? Math.max(0, product.stock_quantity - (product.reserved_quantity || 0))
            : 0;
        const requiredPerBundle = item.quantity || 1;
        const possibleBundles =
            requiredPerBundle > 0
                ? Math.floor(availableStock / requiredPerBundle)
                : 0;
        const threshold = product?.low_stock_threshold || 5;

        return {
            productId: item.child_product_id,
            productName: item.name || product?.name || "Unknown",
            availableStock,
            requiredPerBundle,
            possibleBundles,
            isLimiting: false, // Will be set below
            isBelowThreshold: availableStock <= threshold,
        };
    });

    // Find minimum possible bundles
    const availableBundles = Math.min(
        ...components.map((c) => c.possibleBundles)
    );

    // Mark limiting components
    const limitingComponents = components.filter(
        (c) => c.possibleBundles === availableBundles
    );
    limitingComponents.forEach((c) => {
        c.isLimiting = true;
    });

    const hasStockWarning = components.some(
        (c) => c.isBelowThreshold || c.availableStock === 0
    );

    return {
        availableBundles,
        limitingComponent: limitingComponents[0] || null,
        components,
        hasStockWarning,
    };
}
