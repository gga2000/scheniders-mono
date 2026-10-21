"use client";

import React, { Profiler, Suspense, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useViewport } from "@/hooks/use-viewport";
import { MobileOrdersPage } from "@/components/mobile/orders/MobileOrdersPage";
import { OrderSearchParamSync } from "@/components/orders/order-search-param-sync";
import { OrdersProvider } from "@/components/providers/orders-provider";
import { perfTrace } from "@/lib/perf-trace";

export default function OrdersLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { isMobile } = useViewport();
    const pathname = usePathname();

    // Load tracing (lib/perf-trace.ts): each visit is measured from the click
    // that opened it, or from navigation start on a hard load.
    useEffect(() => {
        perfTrace.beginRoute("orders");
    }, []);

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
        return <OrdersProvider>{searchParamSync}<Profiler id="orders-mobile" onRender={perfTrace.reactCommit}><MobileOrdersPage /></Profiler></OrdersProvider>;
    }

    if (pathname !== "/orders") return <>{children}</>;

    // Fallback to exactly what existed before (desktop view)
    return <OrdersProvider>{searchParamSync}<Profiler id="orders" onRender={perfTrace.reactCommit}>{children}</Profiler></OrdersProvider>;
}
