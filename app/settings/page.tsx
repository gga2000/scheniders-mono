"use client";

import { useState } from "react";
import {
    Settings,
    Store,
    Package,
    Printer,
    Database,
    LayoutDashboard,
    Cloud,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GeneralSettings } from "@/components/settings/general-settings";
import { OrderSettings } from "@/components/settings/order-settings";
import { PrintingSettings } from "@/components/settings/printing-settings";
import { TeamSettings } from "@/components/settings/team-settings";
import { DataSettings } from "@/components/settings/data-settings";
import { LightfunnelsSettings } from "@/components/settings/lightfunnels-settings";
import { PageSettings } from "@/components/settings/pages-settings";
import { UsersRound } from "lucide-react";

const SECTIONS = [
    {
        id: "general",
        label: "General",
        icon: Store,
        component: GeneralSettings,
    },
    {
        id: "team",
        label: "Team & Roles",
        icon: UsersRound,
        component: TeamSettings,
    },
    {
        id: "orders",
        label: "Order Workflow",
        icon: Package,
        component: OrderSettings,
    },
    {
        id: "printing",
        label: "Printing",
        icon: Printer,
        component: PrintingSettings,
    },
    {
        id: "lightfunnels",
        label: "Lightfunnels",
        icon: Cloud,
        component: LightfunnelsSettings,
    },
    {
        id: "pages",
        label: "Pages Access",
        icon: LayoutDashboard,
        component: PageSettings,
    },
    {
        id: "data",
        label: "Data & Backup",
        icon: Database,
        component: DataSettings,
    },
];

export default function SettingsPage() {
    const [activeSection, setActiveSection] = useState("general");

    const ActiveComponent = SECTIONS.find((s) => s.id === activeSection)?.component || GeneralSettings;

    return (
        <div className="flex flex-col md:flex-row h-[calc(100vh-4rem)] bg-muted/10">
            {/* Sidebar Navigation */}
            <aside className="w-full md:w-64 border-r bg-background/50 backdrop-blur-sm p-4 space-y-2 overflow-y-auto">
                <div className="mb-6 px-2">
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <Settings className="w-6 h-6" />
                        Settings
                    </h1>
                    <p className="text-xs text-muted-foreground mt-1 ml-8">System Configuration</p>
                </div>

                {SECTIONS.map((section) => (
                    <button
                        key={section.id}
                        onClick={() => setActiveSection(section.id)}
                        className={cn(
                            "w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200",
                            activeSection === section.id
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                    >
                        <section.icon className="w-4 h-4" />
                        {section.label}
                    </button>
                ))}

                {/* Helper Links */}
                <div className="mt-8 pt-6 border-t">
                    <h3 className="px-2 text-xs font-semibold text-muted-foreground mb-2">Help</h3>
                    <a href="#" className="flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50">
                        <LayoutDashboard className="w-4 h-4" />
                        Documentation
                    </a>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto p-4 md:p-8">
                <div className="max-w-4xl mx-auto animate-in fade-in duration-500">
                    <ActiveComponent />
                </div>
            </main>
        </div>
    );
}
