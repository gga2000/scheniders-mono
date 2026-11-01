import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { productKeys } from "@/hooks/use-products-query";
import {
    receivePurchaseOrder,
    setPurchaseOrderStatus,
    type PurchaseOrderTransition,
    type ReceivedLine,
} from "@/lib/repositories/purchase-orders";

/**
 * Purchase order status changes and receiving. Receiving moves stock, so the
 * product list and the supply histories are refreshed with the PO queries.
 */
export function usePurchaseOrderActions() {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();

    const refreshPurchaseOrders = () =>
        Promise.all([
            queryClient.invalidateQueries({ queryKey: ["open-pos-by-supply"] }),
            queryClient.invalidateQueries({ queryKey: ["supplies-open-pos"] }),
            queryClient.invalidateQueries({ queryKey: ["supplier-pos", tenantId] }),
        ]);

    const changeStatus = useMutation({
        mutationFn: (args: { poId: string; status: PurchaseOrderTransition }) =>
            setPurchaseOrderStatus(args.poId, args.status),
        onSuccess: refreshPurchaseOrders,
    });

    const receive = useMutation({
        mutationFn: (args: { poId: string; lines: ReceivedLine[] }) =>
            receivePurchaseOrder(args.poId, args.lines),
        onSuccess: async () => {
            await Promise.all([
                refreshPurchaseOrders(),
                queryClient.invalidateQueries({ queryKey: productKeys.all }),
                queryClient.invalidateQueries({ queryKey: ["supply-history"] }),
                queryClient.invalidateQueries({ queryKey: ["po-lines"] }),
                queryClient.invalidateQueries({ queryKey: ["tenant-supply-history"] }),
            ]);
        },
    });

    return { changeStatus, receive };
}
