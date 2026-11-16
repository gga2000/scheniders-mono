"use client";

import { SalariesTab } from "@/components/salary/salaries-tab";

// Access is checked by PageGuard in the dashboard layout (lib/route-permissions.ts: "/salaries").
export default function SalariesPage() {
    return (
        <div className="p-4 md:p-6">
            <SalariesTab />
        </div>
    );
}
