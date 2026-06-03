"use client";

import { Suspense } from "react";
import { AutoLinkGoogle } from "@/components/auth/auto-link-google";

export default function SettingsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Protect all settings pages. Only users with ACCESS_SETTINGS permission (Admin) can view.
    return (
        <div className="h-full w-full flex flex-col">
            {/* Auto-start Google linking when arriving via an admin Flow-A claim link. */}
            <Suspense fallback={null}>
                <AutoLinkGoogle />
            </Suspense>
            {children}
        </div>
    );
}
