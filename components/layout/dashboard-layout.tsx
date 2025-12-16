"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
    const [isCollapsed, setIsCollapsed] = useState(false);

    return (
        <div className="flex min-h-screen bg-background text-foreground">
            {/* Sidebar with state */}
            <Sidebar collapsed={isCollapsed} setCollapsed={setIsCollapsed} />

            {/* Main Content Area with smooth transition */}
            <main
                className="flex-1 p-6 min-w-0 transition-all duration-500 ease-in-out"
                style={{
                    marginLeft: isCollapsed ? "88px" : "272px", // 72px sidebar + 16px margin vs 256px + 16px
                    paddingTop: "1.5rem"
                }}
            >
                <div className="max-w-[1400px] mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
