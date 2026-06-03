"use client";

import { useTenant } from "@/hooks/use-tenant";
import { PauseCircle } from "lucide-react";

const BLOCK_LABELS: Record<string, string> = {
    new_orders: "new orders",
    new_products: "product changes",
    team_invites: "team invites",
    storefront_writes: "storefront edits",
};

function formatRemaining(pausedUntil: string | null): string {
    if (!pausedUntil) return "until further notice";
    const ms = Date.parse(pausedUntil) - Date.now();
    if (Number.isNaN(ms) || ms <= 0) return "expiring shortly";
    const totalMinutes = Math.round(ms / 60000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    if (days >= 1) {
        return hours > 0
            ? `for ${days}d ${hours}h`
            : `for ${days} ${days === 1 ? "day" : "days"}`;
    }
    if (hours >= 1) {
        const minutes = totalMinutes % 60;
        return minutes > 0
            ? `for ${hours}h ${minutes}m`
            : `for ${hours} ${hours === 1 ? "hour" : "hours"}`;
    }
    return `for ${Math.max(1, totalMinutes)} min`;
}

/**
 * Informational banner shown when an admin has paused this merchant.
 * Renders only when status === 'limited' and the pause window hasn't lapsed.
 *
 * Doesn't block the UI — paused merchants can still navigate; the server-side
 * guards in `lib/restrictions.ts` are what actually refuse blocked writes.
 */
export function TenantPausedBanner() {
    const { data } = useTenant();

    if (!data || data.status !== "limited") return null;

    const r = data.restrictions;
    if (!r) return null;

    // Expired pause — DB will be auto-cleared on the next server-side check.
    if (r.paused_until && Date.parse(r.paused_until) <= Date.now()) {
        return null;
    }

    const blockedKeys = Object.entries(r.blocks ?? {})
        .filter(([, on]) => on)
        .map(([k]) => BLOCK_LABELS[k] ?? k);

    const blockedSummary = blockedKeys.length
        ? blockedKeys.join(", ")
        : "some account actions";

    return (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2 flex items-center gap-3 text-sm">
            <PauseCircle className="w-4 h-4 shrink-0" />
            <div className="min-w-0 flex-1">
                <span className="font-medium">Account limited:</span>{" "}
                <span>
                    {blockedSummary} are paused {formatRemaining(r.paused_until)}.
                </span>
                {r.reason ? (
                    <span className="text-amber-800/80"> — {r.reason}</span>
                ) : null}
            </div>
        </div>
    );
}
