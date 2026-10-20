"use client";

import { SalariesTab } from "@/components/salary/salaries-tab";
import { useAuth } from "@/components/auth/auth-provider";
import { canAccessRoute } from "@/lib/route-permissions";

export default function SalariesPage() {
    const { role, permissions, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-muted">Loading…</div>
            </div>
        );
    }

    if (!canAccessRoute("/salaries", role, permissions)) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-rose-600 text-sm">Admin access required.</div>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6">
            <SalariesTab />
        </div>
    );
}
