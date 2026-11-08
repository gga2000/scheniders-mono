"use client";

import { Info, Lock } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { ROUTE_PERMISSIONS } from "@/lib/route-permissions";
import { TENANT_ROLES } from "@/lib/permissions";

/** Page name shown for each gated route in lib/route-permissions. */
export const ROUTE_LABEL_KEYS: Readonly<Record<string, string>> = {
    "/orders": "nav.orders",
    "/customers": "nav.customers",
    "/products": "nav.products",
    "/printing": "nav.printing",
    "/prime": "nav.prime",
    "/shipping-export": "settings.pages.route.shippingExport",
    "/shops": "nav.shops",
    "/till": "nav.till",
    "/finances": "nav.finances",
    "/ads": "nav.ads",
    "/salaries": "nav.financesSalaries",
    "/vault": "nav.vault",
    "/analytics": "nav.analytics",
    "/reports": "nav.reports",
    "/team": "nav.team",
    "/settings": "nav.settings",
    "/admin/data-import": "settings.pages.route.dataImport",
};

/**
 * Read-only view of who can open which page. It is drawn from the same
 * ROUTE_PERMISSIONS the sidebar and route guard use, so it cannot drift.
 */
export function PageSettings() {
    const { t } = useLanguage();
    const routes = Object.keys(ROUTE_LABEL_KEYS);

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("settings.pages.title")}</h2>
                <p className="text-muted">{t("settings.pages.subtitle")}</p>
            </div>

            <div className="pastel-card overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-(--card-border) text-xs text-muted-foreground">
                            <th className="p-3 text-start font-medium">{t("settings.pages.col.page")}</th>
                            {TENANT_ROLES.map((role) => (
                                <th key={role} className="p-3 w-28 text-center font-medium">{t(`team.role.${role}`)}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-(--card-border)">
                        {routes.map((route) => {
                            const rule = ROUTE_PERMISSIONS[route];
                            return (
                                <tr key={route} data-testid={`page-row-${route}`}>
                                    <td className="p-3">
                                        <p className="font-medium text-foreground">{t(ROUTE_LABEL_KEYS[route])}</p>
                                        {rule.permission && (
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {t("settings.pages.orPermission", { permission: t(`team.perm.${rule.permission}`) })}
                                            </p>
                                        )}
                                    </td>
                                    {TENANT_ROLES.map((role) => {
                                        const open = rule.roles.includes(role);
                                        return (
                                            <td key={role} className="p-3 text-center">
                                                {open ? (
                                                    <span className="text-xs font-medium text-(--button-success)">{t("settings.pages.open")}</span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                                        <Lock className="w-3 h-3" />
                                                        {t("settings.pages.closed")}
                                                    </span>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="flex gap-3 rounded-xl border border-(--card-border) p-4">
                <Info className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="space-y-1 text-xs text-muted-foreground leading-relaxed">
                    <p>{t("settings.pages.noteOthers")}</p>
                    <p>{t("settings.pages.noteChange")}</p>
                </div>
            </div>
        </div>
    );
}
