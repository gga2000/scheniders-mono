"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTenant } from "@/hooks/use-tenant";
import { useBillingLock, type BillingLock } from "@/hooks/use-billing-lock";
import { isBillingExempt } from "@/lib/billing-exempt";
import { isOpenWhileLocked } from "@/lib/billing/lock-routes";
import { BillingLockScreen } from "./billing-lock-screen";

/**
 * Shows the lock screen instead of a page a billing-locked shop may not use.
 * The database is what keeps the storefront allowance and the money right;
 * this keeps the locked features out of reach in the dashboard. Until the
 * lock is known the page renders as usual, so an unlocked shop never waits.
 */
export function BillingLockGate({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { data: tenant } = useTenant();
    const exempt = !tenant || isBillingExempt(tenant.plan);
    const { data: lock } = useBillingLock(!exempt);

    if (exempt || !lock?.locked) return <>{children}</>;
    // Settings is open only on its billing section. The section is read here,
    // for a locked shop only, so no other page reads the query string.
    if (pathname === "/settings") {
        return (
            <Suspense fallback={<BillingLockScreen lock={lock} />}>
                <SettingsSectionGate lock={lock}>{children}</SettingsSectionGate>
            </Suspense>
        );
    }
    if (isOpenWhileLocked(pathname, null)) return <>{children}</>;
    return <BillingLockScreen lock={lock} />;
}

function SettingsSectionGate({ lock, children }: { lock: BillingLock; children: React.ReactNode }) {
    const section = useSearchParams().get("section");
    return isOpenWhileLocked("/settings", section) ? <>{children}</> : <BillingLockScreen lock={lock} />;
}
