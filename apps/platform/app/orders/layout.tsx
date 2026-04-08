"use client";

import React from "react";
import { useViewport } from "@/hooks/use-viewport";
import { MobileOrdersPage } from "@/components/mobile/orders/MobileOrdersPage";

export default function OrdersLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { isMobile } = useViewport();

    // Feature flag - keep false by default to ensure no disruption to desktop users
    const ENABLE_MOBILE = true;

    if (isMobile && ENABLE_MOBILE) {
        return <MobileOrdersPage />;
    }

    // Fallback to exactly what existed before (desktop view)
    return <>{children}</>;
}
