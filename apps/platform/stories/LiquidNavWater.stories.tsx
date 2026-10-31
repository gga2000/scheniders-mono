import type { Meta, StoryObj } from "@storybook/nextjs";
import { useState } from "react";
import { BarChart3, Box, LayoutDashboard, Printer, ReceiptText, Store, Users, UsersRound, Vault, Wallet } from "lucide-react";
import { LiquidNavWater } from "@/components/ui/liquid-nav-water";
import { cn } from "@/lib/utils";

const ITEMS = [
    { key: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "/orders", label: "Orders", icon: ReceiptText },
    { key: "/customers", label: "Customers", icon: Users },
    { key: "/products", label: "Products", icon: Box },
    { key: "/printing", label: "Print Queue", icon: Printer },
    { key: "/finances", label: "Finances", icon: Wallet },
    { key: "/reports", label: "Reports", icon: BarChart3 },
    { key: "/store", label: "Store", icon: Store },
    { key: "/team", label: "Team", icon: UsersRound },
    { key: "/vault", label: "Data Vault", icon: Vault },
];

/** The sidebar's panel and item styling, with local state standing in for the route. */
function SidebarPanel({ collapsed }: { collapsed: boolean }) {
    const [active, setActive] = useState<string | null>("/orders");
    return (
        <div className={cn("rounded-[32px] border border-white/5 bg-[#1E1E1E] py-6 text-white", collapsed ? "w-[72px]" : "w-[256px] px-6")}>
            <nav className="p-2">
                <LiquidNavWater activeKey={active}>
                    {ITEMS.map(({ key, label, icon: Icon }) => {
                        const isActive = key === active;
                        return (
                            <button
                                key={key}
                                type="button"
                                data-liquid-key={key}
                                onClick={() => setActive(key)}
                                title={collapsed ? label : undefined}
                                className={cn(
                                    "relative flex w-full items-center rounded-2xl py-2.5 transition-colors",
                                    collapsed ? "justify-center" : "gap-3 px-3",
                                    isActive ? "text-white [[data-liquid-water=pending]_&]:bg-white/10" : "text-zinc-500 hover:bg-white/[0.03] hover:text-white",
                                )}
                            >
                                <Icon className="h-[22px] w-[22px]" />
                                {!collapsed && <span className="text-[15px] font-medium">{label}</span>}
                            </button>
                        );
                    })}
                </LiquidNavWater>
            </nav>
        </div>
    );
}

const meta = {
    title: "Layout/LiquidNavWater",
    component: SidebarPanel,
    parameters: { layout: "centered" },
    args: { collapsed: false },
} satisfies Meta<typeof SidebarPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Expanded: Story = {};
export const Collapsed: Story = { args: { collapsed: true } };
