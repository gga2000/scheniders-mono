/**
 * The guided first product walks five stops in order: name, photo, price,
 * stock, save. The light sits on the first stop that still needs something,
 * so it moves on by itself as the merchant types.
 */
export const PRODUCT_WALK = ["name", "photo", "price", "stock", "save"] as const;
export type ProductWalkStop = (typeof PRODUCT_WALK)[number];

export interface ProductWalkDraft {
    name: string;
    imageUrl: string;
    price: number;
    stock: number;
}

/** Which stops are filled in. Save is never "filled": it ticks when the product exists. */
export function productWalkFilled(draft: ProductWalkDraft | null): Record<ProductWalkStop, boolean> {
    return {
        name: !!draft?.name.trim(),
        photo: !!draft?.imageUrl.trim(),
        price: (draft?.price ?? 0) > 0,
        stock: (draft?.stock ?? 0) > 0,
        save: false,
    };
}

/** Index of the first stop that still needs something (4 = save). */
export function productWalkStage(draft: ProductWalkDraft | null): number {
    const filled = productWalkFilled(draft);
    const at = PRODUCT_WALK.findIndex((stop) => !filled[stop]);
    return at === -1 ? PRODUCT_WALK.length - 1 : at;
}
