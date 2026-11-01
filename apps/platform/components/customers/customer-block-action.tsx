"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Ban, ShieldCheck } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSIONS } from "@/lib/permissions";
import { addToBlacklist, fetchBlacklistEntry, removeFromBlacklist } from "@/lib/blacklist";
import { formatPhoneDisplay } from "@/lib/customer-format";
import { cn } from "@/lib/utils";

// Opened on demand; kept out of the customers bundles.
const BlacklistDialog = dynamic(() => import("@/components/orders/blacklist-dialog").then((m) => m.BlacklistDialog), { ssr: false });

/**
 * Block or unblock a customer: the one flow the drawer and the full profile
 * share. Neither action is ever the filled primary. Block is a rose outline;
 * Unblock is a quiet outline that opens a confirm step showing the reason on
 * record, because reversing a "do not ship" should be deliberate. Renders
 * nothing when the user may not take the action.
 */
export function CustomerBlockAction({
    phone, name, isBlacklisted, className,
}: {
    /** Normalized phone (no leading 0). */
    phone: string;
    name: string;
    /** On the store's blacklist: the action is Unblock, otherwise Block. */
    isBlacklisted: boolean;
    /** Height and padding from the surrounding action row. */
    className?: string;
}) {
    const { t } = useLanguage();
    const { can } = usePermission();
    const { tenantId, profile, user } = useAuth();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const mode = isBlacklisted ? "remove" : "add";

    // The confirm step shows why the number was blocked; read only when it opens.
    const entry = useQuery({
        queryKey: ["customer-blacklist-entry", tenantId, phone],
        queryFn: () => fetchBlacklistEntry(tenantId as string, phone),
        enabled: open && mode === "remove" && !!tenantId,
        staleTime: 0,
    });

    if (!can(isBlacklisted ? PERMISSIONS.UNBLOCK_CUSTOMERS : PERMISSIONS.BLOCK_CUSTOMERS)) return null;

    const onConfirm = async (reason?: string, notes?: string) => {
        if (!tenantId) throw new Error("No active store");
        if (mode === "add") {
            await addToBlacklist({
                tenantId, phone, reason: reason ?? "", notes,
                addedBy: profile?.display_name || user?.email || null,
            });
        } else {
            await removeFromBlacklist(tenantId, phone);
        }
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["customers"] }),
            queryClient.invalidateQueries({ queryKey: ["customer-profile"] }),
            queryClient.invalidateQueries({ queryKey: ["customer-dialog"] }),
            queryClient.invalidateQueries({ queryKey: ["customer-blacklist-entry"] }),
        ]);
    };

    const Icon = isBlacklisted ? ShieldCheck : Ban;

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={cn(
                    "rounded-xl border font-semibold inline-flex items-center justify-center gap-2 transition-colors",
                    isBlacklisted
                        ? "border-(--card-border) text-foreground hover:bg-muted/40"
                        : "border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/10",
                    className,
                )}
            >
                <Icon className="w-4 h-4" />
                {isBlacklisted ? t("customers.details.unblock") : t("customers.drawer.block")}
            </button>
            {open && (
                <BlacklistDialog
                    open
                    onClose={() => setOpen(false)}
                    mode={mode}
                    customerName={name}
                    customerPhone={formatPhoneDisplay(phone)}
                    existingEntry={entry.data ?? null}
                    onConfirm={onConfirm}
                />
            )}
        </>
    );
}
