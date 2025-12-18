"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./global-search";
import { AnimatePresence } from "framer-motion";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
    const [isCollapsed, setIsCollapsed] = useState(false);

    return (
        <div className="flex min-h-screen bg-background text-foreground">
            {/* Sidebar with state */}
            <Sidebar collapsed={isCollapsed} setCollapsed={setIsCollapsed} />

            {/* Main Content Area with smooth transition */}
            <main
                className="flex-1 min-w-0 transition-all duration-500 ease-in-out overflow-hidden"
                style={{
                    marginLeft: isCollapsed ? "88px" : "272px",
                }}
            >
                {/* Top Bar with Global Search */}
                <TopBar />

                <AnimatePresence mode="wait">
                    <div className="max-w-[1800px] mx-auto">
                        {children}
                    </div>
                </AnimatePresence>
            </main>
        </div>
    );
}
