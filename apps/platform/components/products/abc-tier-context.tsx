"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { calculateABCTiers, type ABCTier } from "@/lib/utils/product-scoring";

type TierLookup = (productId: string) => ABCTier | null;

const AbcTierContext = createContext<TierLookup>(() => null);

export function AbcTierProvider({
    products,
    children,
}: {
    products: { id: string; total_revenue?: number | null }[];
    children: ReactNode;
}) {
    const lookup = useMemo<TierLookup>(() => {
        const input = products.map((p) => ({ id: p.id, total_revenue: p.total_revenue ?? 0 }));
        const map = calculateABCTiers(input);
        return (id: string) => map.get(id) ?? null;
    }, [products]);

    return <AbcTierContext.Provider value={lookup}>{children}</AbcTierContext.Provider>;
}

export function useAbcTier(productId: string): ABCTier | null {
    const lookup = useContext(AbcTierContext);
    return lookup(productId);
}
