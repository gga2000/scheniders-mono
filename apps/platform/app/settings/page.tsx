"use client";

import { useState, useMemo } from "react";
import {
    Settings,
    Store,
    Package,
    Printer,
    Database,
    LayoutDashboard,
    Link2,
    UsersRound,
    Search,
    ShieldBan,
    Building2,
    CreditCard,
    BellRing,
    PackageX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GeneralSettings } from "@/components/settings/general-settings";
import { OrderSettings } from "@/components/settings/order-settings";
import { PrintingSettings } from "@/components/settings/printing-settings";
import { TeamSettings } from "@/components/settings/team-settings";
import { DataSettings } from "@/components/settings/data-settings";
import { LightfunnelsSettings } from "@/components/settings/lightfunnels-settings";
import { PageSettings } from "@/components/settings/pages-settings";
import { WaseetSettingsPanel } from "@/components/settings/waseet-settings";
import { CustomerBlacklist } from "@/components/settings/customer-blacklist";
import { BusinessSettings } from "@/components/settings/business-settings";
import { BillingSettings } from "@/components/settings/billing-settings";
import { StaffAlertsSettings } from "@/components/settings/staff-alerts-settings";
import { OrderReasonsManager } from "@/components/settings/order-reasons-manager";

function IntegrationsSettings() {
    const [tab, setTab] = useState<"lightfunnels" | "waseet">("lightfunnels");
    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">Integrations</h2>
                <p className="text-sm text-muted-foreground">Manage your third-party platform connections.</p>
            </div>
            <div className="flex gap-1 p-1 bg-muted/40 rounded-xl w-fit border border-(--card-border)">
                {(["lightfunnels", "waseet"] as const).map((id) => (
                    <button
                        key={id}
                        onClick={() => setTab(id)}
                        className={cn(
                            "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
                            tab === id
                                ? "bg-background shadow-sm text-foreground"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {id === "lightfunnels" ? "Lightfunnels" : "Waseet"}
                    </button>
                ))}
            </div>
            <div className="animate-in fade-in duration-200">
                {tab === "lightfunnels" ? <LightfunnelsSettings /> : <WaseetSettingsPanel />}
            </div>
        </div>
    );
}

const SECTIONS = [
    {
        id: "business",
        title: "Business",
        description: "Profile, branding & plan",
        icon: Building2,
        colorVar: "--pastel-orange",
        iconColor: "text-orange-700",
        component: BusinessSettings,
        keywords: ["business", "tenant", "branding", "logo", "color", "plan", "subscription", "trial", "name", "contact"],
    },
    {
        id: "billing",
        title: "Billing",
        description: "Wallet, usage & plans",
        icon: CreditCard,
        colorVar: "--pastel-green",
        iconColor: "text-green-700",
        component: BillingSettings,
        keywords: ["billing", "wallet", "balance", "top-up", "usage", "plan", "subscription", "charge", "payment", "invoice"],
    },
    {
        id: "general",
        title: "Store",
        description: "Profile, currency & timezone",
        icon: Store,
        colorVar: "--pastel-purple",
        iconColor: "text-purple-700",
        component: GeneralSettings,
        keywords: ["store", "name", "currency", "timezone", "inventory", "notifications", "sound"],
    },
    {
        id: "orders",
        title: "Orders",
        description: "Fees, workflow & templates",
        icon: Package,
        colorVar: "--pastel-yellow",
        iconColor: "text-amber-700",
        component: OrderSettings,
        keywords: ["orders", "delivery", "fees", "rejection", "workflow", "templates", "whatsapp", "governorate"],
    },
    {
        id: "printing",
        title: "Printing",
        description: "Labels & batch settings",
        icon: Printer,
        colorVar: "--pastel-blue",
        iconColor: "text-blue-700",
        component: PrintingSettings,
        keywords: ["printing", "labels", "size", "batch", "phone", "price", "4x6", "a4"],
    },
    {
        id: "team",
        title: "Team",
        description: "Users, roles & access",
        icon: UsersRound,
        colorVar: "--pastel-green",
        iconColor: "text-green-700",
        component: TeamSettings,
        keywords: ["team", "users", "roles", "admin", "employee", "permissions", "invite"],
    },
    {
        id: "integrations",
        title: "Integrations",
        description: "Lightfunnels & Waseet",
        icon: Link2,
        colorVar: "--pastel-mint",
        iconColor: "text-teal-700",
        component: IntegrationsSettings,
        keywords: ["integrations", "lightfunnels", "waseet", "sync", "api", "token", "connect"],
    },
    {
        id: "staff-alerts",
        title: "Staff Alerts",
        description: "WhatsApp alerts on new orders",
        icon: BellRing,
        colorVar: "--pastel-yellow",
        iconColor: "text-amber-700",
        component: StaffAlertsSettings,
        keywords: ["staff", "alerts", "whatsapp", "notify", "phone", "new order", "interakt"],
    },
    {
        id: "order-reasons",
        title: "Order Reasons",
        description: "Manage cancel/reject reasons",
        icon: PackageX,
        colorVar: "--pastel-orange",
        iconColor: "text-orange-700",
        component: OrderReasonsManager,
        keywords: ["reasons", "rejection", "cancel", "reject", "labels", "dropdown"],
    },
    {
        id: "blacklist",
        title: "Blacklist",
        description: "Block problem customers",
        icon: ShieldBan,
        colorVar: "--pastel-pink",
        iconColor: "text-rose-700",
        component: CustomerBlacklist,
        keywords: ["blacklist", "block", "customer", "phone", "ban", "fraud"],
    },
    {
        id: "pages",
        title: "Pages",
        description: "Access & permissions",
        icon: LayoutDashboard,
        colorVar: "--pastel-purple",
        iconColor: "text-purple-700",
        component: PageSettings,
        keywords: ["pages", "access", "permissions", "roles", "control", "viewer"],
    },
    {
        id: "data",
        title: "Data",
        description: "Backup & export",
        icon: Database,
        colorVar: "--pastel-blue",
        iconColor: "text-blue-700",
        component: DataSettings,
        keywords: ["data", "backup", "export", "csv", "restore", "snapshot", "download"],
    },
];

export default function SettingsPage() {
    const [activeSection, setActiveSection] = useState("business");
    const [search, setSearch] = useState("");

    const filtered = useMemo(() => {
        if (!search.trim()) return SECTIONS;
        const q = search.toLowerCase();
        return SECTIONS.filter(
            (s) =>
                s.title.toLowerCase().includes(q) ||
                s.description.toLowerCase().includes(q) ||
                s.keywords.some((k) => k.includes(q))
        );
    }, [search]);

    const ActiveComponent =
        SECTIONS.find((s) => s.id === activeSection)?.component || GeneralSettings;

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] bg-background">
            {/* Page Header + Search — single row */}
            <div className="flex items-center justify-between gap-4 px-6 py-4 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-(--pastel-purple) flex items-center justify-center shadow-sm">
                        <Settings className="w-5 h-5 text-purple-700" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-foreground leading-tight">Settings</h1>
                        <p className="text-xs text-muted-foreground">System Configuration</p>
                    </div>
                </div>
                <div className="relative w-56">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <input
                        type="text"
                        placeholder="Search settings..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-8 pr-4 h-8 rounded-xl border border-(--card-border) bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-(--pastel-purple) focus:border-transparent transition-all"
                    />
                </div>
            </div>

            {/* Main Layout */}
            <div className="flex flex-col md:flex-row flex-1 overflow-hidden px-6 pb-6 gap-5 pt-0">
                {/* Left: Nav Cards Grid */}
                <div className="w-full md:w-72 shrink-0 overflow-y-auto">
                    {filtered.length === 0 ? (
                        <div className="text-sm text-muted-foreground text-center py-10">
                            No settings found for &quot;{search}&quot;
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-2.5">
                            {filtered.map((section) => {
                                const Icon = section.icon;
                                const isActive = activeSection === section.id;
                                return (
                                    <button
                                        key={section.id}
                                        onClick={() => setActiveSection(section.id)}
                                        className={cn(
                                            "pastel-card p-3.5 flex flex-col gap-2.5 text-left transition-all duration-200 rounded-2xl border-2 group cursor-pointer",
                                            isActive
                                                ? "border-primary shadow-lg"
                                                : "border-transparent hover:border-(--card-border)"
                                        )}
                                        style={isActive ? { background: "rgba(30,30,30,0.04)" } : undefined}
                                    >
                                        <div
                                            className={cn(
                                                "h-9 w-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
                                            )}
                                            style={{ background: `var(${section.colorVar})` }}
                                        >
                                            <Icon className={cn("h-4 w-4", section.iconColor)} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className={cn("font-semibold text-sm leading-tight", isActive ? "text-foreground" : "text-foreground/80")}>
                                                {section.title}
                                            </p>
                                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                                                {section.description}
                                            </p>
                                        </div>
                                        {isActive && (
                                            <div className="flex items-center gap-1">
                                                <div className="w-1.5 h-1.5 rounded-full bg-(--button-success)" />
                                                <span className="text-[10px] text-(--button-success) font-semibold uppercase tracking-wide">
                                                    Active
                                                </span>
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Divider */}
                <div className="hidden md:block w-px bg-(--card-border) shrink-0 my-1" />

                {/* Right: Content Panel */}
                <main className="flex-1 overflow-y-auto min-w-0">
                    <div className="w-full animate-in fade-in duration-300">
                        <ActiveComponent />
                    </div>
                </main>
            </div>
        </div>
    );
}
