"use client";

import { PageGuard } from "@/components/auth/role-guard";
import { PERMISSIONS } from "@/lib/permissions";

export default function SettingsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Protect all settings pages. Only users with ACCESS_SETTINGS permission (Admin) can view.
    return (
        <PageGuard requiredPermission={PERMISSIONS.ACCESS_SETTINGS}>
            {children}
        </PageGuard>
    );
}
