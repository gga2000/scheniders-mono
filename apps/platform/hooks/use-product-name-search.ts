"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { productKeys } from "@/hooks/use-products-query";
import { productRepository, type ProductSearchMatch } from "@/lib/repositories/product-repository";

const EMPTY: ProductSearchMatch[] = [];

/** Under `productKeys.all`, so a product mutation's invalidation refreshes these too. */
export const productNameSearchKeys = {
    term: (tenantId: string | null, text: string, limit: number) =>
        [...productKeys.all, "name-search", tenantId, text, limit] as const,
};

/**
 * Catalogue products whose name contains `term` (already debounced by the
 * caller), for the top-bar search. An empty term makes no request.
 */
export function useProductNameSearch(term: string, limit: number): { products: ProductSearchMatch[]; pending: boolean } {
    const { session, clientReady, tenantId } = useAuth();
    const text = term.trim();

    const query = useQuery({
        queryKey: productNameSearchKeys.term(tenantId, text, limit),
        queryFn: () => {
            if (!tenantId) throw new Error("No active tenant");
            return productRepository.searchByName(tenantId, text, limit);
        },
        enabled: text.length > 0 && !!session && clientReady && !!tenantId,
        staleTime: 60_000,
        placeholderData: keepPreviousData,
    });

    return {
        products: text.length > 0 ? query.data ?? EMPTY : EMPTY,
        pending: text.length > 0 && (query.isPending || query.isPlaceholderData),
    };
}
