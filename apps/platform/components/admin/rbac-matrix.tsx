"use client";

import { PERMISSION_CATEGORIES, ROLE_PERMISSIONS, UserRole, ROLES } from "@/lib/permissions";
import { Check, Shield, X, HelpCircle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export function RBACMatrix() {
    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-purple-100 dark:bg-purple-900/20 rounded-xl">
                    <Shield className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-foreground">Access Control Matrix</h2>
                    <p className="text-sm text-muted-foreground">Overview of system roles and their capabilities</p>
                </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead>
                            <tr className="bg-muted/50 border-b border-border">
                                <th className="py-4 px-6 font-semibold text-foreground min-w-[200px]">Permission</th>
                                {ROLES.map((role) => (
                                    <th key={role} className="py-4 px-6 text-center font-semibold text-foreground capitalize min-w-[100px]">
                                        <div className="flex flex-col items-center gap-1">
                                            <span>{role}</span>
                                            {(role === "admin" || role === "super_admin") && (
                                                <span className="text-[10px] font-normal px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full border border-yellow-200">
                                                    Full Access
                                                </span>
                                            )}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {PERMISSION_CATEGORIES.map((category) => (
                                <片 key={category.category}>
                                    {/* Category Header */}
                                    <tr className="bg-muted/30">
                                        <td colSpan={4} className="py-2 px-4 font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                                            {category.category}
                                        </td>
                                    </tr>
                                    {/* Permission Rows */}
                                    {category.items.map((item) => (
                                        <tr key={item.key} className="hover:bg-muted/20 transition-colors">
                                            <td className="py-3 px-6">
                                                <div className="font-medium text-foreground">{item.label}</div>
                                                <div className="text-xs text-muted-foreground font-mono mt-0.5">{item.key}</div>
                                            </td>
                                            {ROLES.map((role) => {
                                                const hasAccess = ROLE_PERMISSIONS[role].includes(item.key) || role === "admin" || role === "super_admin";
                                                return (
                                                    <td key={`${role}-${item.key}`} className="py-3 px-6 text-center">
                                                        <div className="flex justify-center">
                                                            {hasAccess ? (
                                                                <div className={cn(
                                                                    "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                                                                    role === 'admin'
                                                                        ? "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
                                                                        : "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                                                                )}>
                                                                    {role === 'admin' ? <Lock className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                                                                </div>
                                                            ) : (
                                                                <div className="w-8 h-8 rounded-full bg-red-50 text-red-300 dark:bg-red-900/10 dark:text-red-900/40 flex items-center justify-center">
                                                                    <X className="w-4 h-4" />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </片>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// Helper fragment to avoid key warnings in map
function 片({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
