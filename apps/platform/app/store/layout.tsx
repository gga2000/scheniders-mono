"use client";

import { usePathname } from "next/navigation";
import { StoreTabs } from "@/components/store-command-center/store-tabs";

// The editor, the wizard and the legacy /store/v2 preview own their whole viewport;
// only the hub-level surfaces get the section tabs.
const TABBED_ROUTES = new Set(["/store", "/store/reviews", "/store/recovery"]);

export default function StoreLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    if (!TABBED_ROUTES.has(pathname)) return <>{children}</>;

    return (
        <div className="flex flex-col">
            <StoreTabs />
            {children}
        </div>
    );
}
