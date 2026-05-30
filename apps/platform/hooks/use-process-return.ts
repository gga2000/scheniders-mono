"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { processReturn, undoReturn, type ProcessReturnInput } from "@/lib/returns/process-return";
import { orderKeys } from "@/hooks/use-orders-query";
import { productKeys } from "@/hooks/use-products-query";
import { useAuth } from "@/components/auth/auth-provider";

export function useProcessReturn() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: ProcessReturnInput) => processReturn(input),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
            queryClient.invalidateQueries({ queryKey: productKeys.lists() });
        },
    });
}

export function useUndoReturn() {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();
    return useMutation({
        mutationFn: (orderId: string) => undoReturn(orderId, tenantId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
            queryClient.invalidateQueries({ queryKey: productKeys.lists() });
        },
    });
}
