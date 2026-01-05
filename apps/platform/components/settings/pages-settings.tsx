"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
    Layout,
    Shield,
    Check,
    X,
    Lock,
    Unlock,
    Info
} from "lucide-react";
import { PERMISSIONS as ALL_PERMISSIONS } from "@/lib/permissions";

// Mapping of App Pages to Readable Names and their Required Permissions
// This is a UI-level mapping to help admins understand "What permission controls this page?"
const PAGE_MAPPINGS = [
    {
        id: "dashboard",
        path: "/",
        title: "Dashboard",
        description: "Main overview. Restricted to Admins.",
        permission: ALL_PERMISSIONS.VIEW_ANALYTICS // Using Analytics permission as proxy for Dashboard access
    },
    {
        id: "orders",
        path: "/orders",
        title: "Orders Data",
        description: "Access to the main orders list and details",
        permission: ALL_PERMISSIONS.VIEW_ORDERS
    },
    {
        id: "customers",
        path: "/customers",
        title: "Customers Data",
        description: "Access to customer database and profiles",
        permission: ALL_PERMISSIONS.VIEW_CUSTOMERS
    },
    {
        id: "products",
        path: "/products",
        title: "Products",
        description: "Manage product inventory",
        permission: ALL_PERMISSIONS.VIEW_ORDERS // Shared permission for now
    },
    {
        id: "analytics",
        path: "/analytics",
        title: "Analytics & Financials",
        description: "Financial reports and charts",
        permission: ALL_PERMISSIONS.VIEW_ANALYTICS
    },
    {
        id: "printing",
        path: "/printing",
        title: "Printing Station",
        description: "Access to exporting and printing orders",
        permission: ALL_PERMISSIONS.EXPORT_DATA
    },
    {
        id: "settings",
        path: "/settings",
        title: "System Settings",
        description: "Global system configuration",
        permission: ALL_PERMISSIONS.ACCESS_SETTINGS
    },
    {
        id: "team",
        path: "/settings/team",
        title: "Team Management",
        description: "Manage users and permissions",
        permission: ALL_PERMISSIONS.MANAGE_USERS
    }
];

export function PageSettings() {
    // This view is mostly informational - showing which permission controls which page.
    // However, if we want to "toggle" a page for a role, we are essentially toggling that permission for that role.
    // Since permission management is handled in the "Team & Permissions" matrix, 
    // this page serves as a unified view to understand the structure.

    // Ideally, we could replicate the checkbox logic here, but focused on Pages.

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div>
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <Layout className="w-6 h-6 text-primary" />
                    Page Access Control
                </h2>
                <p className="text-muted-foreground">
                    Overview of restricted pages and their required permissions.
                </p>
            </div>

            <div className="grid gap-4">
                {PAGE_MAPPINGS.map((page) => (
                    <motion.div
                        key={page.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-card border border-border rounded-xl p-5 flex items-start md:items-center gap-4 justify-between"
                    >
                        <div className="flex items-start gap-4">
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                <Lock className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-lg">{page.title}</h3>
                                <code className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground font-mono">
                                    {page.path}
                                </code>
                                <p className="text-sm text-muted-foreground mt-1">
                                    {page.description}
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col items-end gap-2">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-lg border border-border">
                                <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-xs font-medium text-foreground">
                                    Requires: <span className="text-primary">{page.permission}</span>
                                </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground max-w-[200px] text-right">
                                To grant access, enable this permission for the role or user in Team Settings.
                            </p>
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex gap-3">
                <Info className="w-5 h-5 text-blue-500 shrink-0" />
                <div className="space-y-1">
                    <h4 className="text-sm font-medium text-blue-700 dark:text-blue-300">How to restrict pages?</h4>
                    <p className="text-xs text-blue-600/80 dark:text-blue-400/80 leading-relaxed">
                        Access to pages is controlled by the underlying permissions. For example, removing
                        "View Orders" permission will automatically block access to the Orders page.
                        Use the <b>Team & Permissions</b> tab to configure these assignments.
                    </p>
                </div>
            </div>
        </div>
    );
}
