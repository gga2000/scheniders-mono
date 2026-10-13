"use client";

import React, { Suspense } from "react";
import { useViewport } from "@/hooks/use-viewport";
import { MobileOrdersPage } from "@/components/mobile/orders/MobileOrdersPage";
import { OrderSearchParamSync } from "@/components/orders/order-search-param-sync";

export default function OrdersLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { isMobile } = useViewport();

    // Feature flag - keep false by default to ensure no disruption to desktop users
    const ENABLE_MOBILE = true;

    // `?search=` applies to both layouts. Suspense: useSearchParams opts the
    // subtree out of static rendering, and only this null-rendering sync needs it.
    const searchParamSync = (
        <Suspense fallback={null}>
            <OrderSearchParamSync />
        </Suspense>
    );

    if (isMobile && ENABLE_MOBILE) {
        return <>{searchParamSync}<MobileOrdersPage /></>;
    }

    // Fallback to exactly what existed before (desktop view)
    return <>{searchParamSync}{children}</>;
}
