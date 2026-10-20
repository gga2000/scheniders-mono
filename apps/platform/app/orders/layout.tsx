"use client";

import React, { Suspense } from "react";
import { usePathname } from "next/navigation";
import { useViewport } from "@/hooks/use-viewport";
import { MobileOrdersPage } from "@/components/mobile/orders/MobileOrdersPage";
import { OrderSearchParamSync } from "@/components/orders/order-search-param-sync";
import { OrdersProvider } from "@/components/providers/orders-provider";

export default function OrdersLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { isMobile } = useViewport();
    const pathname = usePathname();

    // Feature flag - keep false by default to ensure no disruption to desktop users
    const ENABLE_MOBILE = true;

    // `?search=` applies to both layouts. Suspense: useSearchParams opts the
    // subtree out of static rendering, and only this null-rendering sync needs it.
    const searchParamSync = (
        <Suspense fallback={null}>
            <OrderSearchParamSync />
        </Suspense>
    );

    // The order book is mounted per route (see OrdersProvider), and here only
    // for what reads it: the orders list, the mobile orders page and the
    // `?search=` sync. /orders/trash lists deleted orders from the server and
    // does not pay for the window.
    if (isMobile && ENABLE_MOBILE) {
        return <OrdersProvider>{searchParamSync}<MobileOrdersPage /></OrdersProvider>;
    }

    if (pathname !== "/orders") return <>{children}</>;

    // Fallback to exactly what existed before (desktop view)
    return <OrdersProvider>{searchParamSync}{children}</OrdersProvider>;
}
