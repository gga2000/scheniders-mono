"use client";

import { SalariesTab } from "@/components/salary/salaries-tab";
import { useAuth } from "@/components/auth/auth-provider";

export default function SalariesPage() {
    const { role, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-muted">Loading…</div>
            </div>
        );
    }

    if (role !== "admin") {
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
