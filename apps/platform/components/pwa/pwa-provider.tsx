"use client";

import { useEffect } from "react";
import { registerServiceWorker, PWAInstallBanner, OfflineIndicator } from "@/lib/pwa";

export function PWAProvider({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        // Register service worker on mount
        registerServiceWorker();
    }, []);

    return (
        <>
            {children}
            {/* PWA Install Banner hidden — uncomment when ready to ship */}
            {/* <PWAInstallBanner /> */}
            <OfflineIndicator />
        </>
    );
}
