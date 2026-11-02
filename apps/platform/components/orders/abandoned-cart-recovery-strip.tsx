"use client";

import Link from "next/link";
import { FinancialValue } from "@/components/ui/financial-value";
import { useLanguage } from "@/hooks/use-language";
import { useAbandonedCartRecovery } from "@/hooks/use-abandoned-cart-recovery";
import type { AbandonedCartRecovery } from "@/lib/orders/abandoned-cart-recovery";
import { cn } from "@/lib/utils";

/** changed_by the WhatsApp dispatcher writes; shown as a label, not a person. */
const BOT_NAME = "whatsapp_bot";

/**
 * How abandoned carts ended over the last 30 days, above the Abandoned tab:
 * still open (and how many went stale), taken by staff, came back on their
 * own, the recovery rate, what the system removed and why, and who on the
 * team took them. Numbers come from get_abandoned_cart_recovery; the IQD
 * figure is masked for roles without VIEW_FINANCIALS. Renders nothing until
 * there is at least one cart in the window.
 */
export function AbandonedCartRecoveryStrip() {
    const { t } = useLanguage();
    const { data, isError } = useAbandonedCartRecovery();

    if (isError) {
        return (
            <p role="alert" className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                {t("orders.recovery.loadFailed")}
            </p>
        );
    }
    if (!data || isEmpty(data)) return null;

    const removed = [
        { key: "junkLocation", n: data.removed.junk_location },
        { key: "junkPhone", n: data.removed.junk_phone },
        { key: "alreadyOrdered", n: data.removed.already_ordered },
        { key: "expired", n: data.removed.expired },
    ].filter((r) => r.n > 0);

    return (
        <section
            data-testid="abandoned-cart-recovery"
            aria-labelledby="abandoned-cart-recovery-title"
            className="rounded-2xl border border-border bg-card p-4"
        >
            <h2 id="abandoned-cart-recovery-title" className="text-xs font-bold text-muted-foreground">
                {t("orders.recovery.title", { days: data.days })}
            </h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label={t("orders.recovery.open")} value={data.open}>
                    {data.open_stale > 0 && (
                        <span className="text-[#B4533F] dark:text-[#F4B4A6]">
                            {t("orders.recovery.openStale", { n: data.open_stale })}
                        </span>
                    )}
                </Stat>
                <Stat label={t("orders.recovery.recovered")} value={data.recovered}>
                    {t("orders.recovery.recoveredCompleted", { n: data.recovered_completed })}
                    {" · "}
                    <FinancialValue amount={data.recovered_iqd} hideToggle className="tabular-nums" />
                </Stat>
                <Stat label={t("orders.recovery.returned")} value={data.returned} />
                <Stat label={t("orders.recovery.rate")} value={`${data.rate}%`} />
            </dl>
            <div className="mt-3 flex flex-col gap-1 border-t border-border pt-3 text-xs text-muted-foreground">
                <p>
                    <span className="font-semibold text-foreground">{t("orders.recovery.removed")}</span>{" "}
                    {removed.length === 0
                        ? t("orders.recovery.removedNone")
                        : removed.map((r) => t(`orders.recovery.removed.${r.key}`, { n: r.n })).join(" · ")}
                    {removed.length > 0 && (
                        <>
                            {" · "}
                            <Link href="/orders/trash" className="font-semibold text-foreground underline-offset-2 hover:underline">
                                {t("orders.recovery.viewTrash")}
                            </Link>
                        </>
                    )}
                </p>
                {data.by_staff.length > 0 && (
                    <p>
                        <span className="font-semibold text-foreground">{t("orders.recovery.byStaff")}</span>{" "}
                        {data.by_staff
                            .map((s) => `${s.name === BOT_NAME ? t("orders.recovery.bot") : s.name} ${s.recovered}`)
                            .join(" · ")}
                    </p>
                )}
            </div>
        </section>
    );
}

function isEmpty(d: AbandonedCartRecovery): boolean {
    const removed = d.removed.junk_phone + d.removed.junk_location + d.removed.already_ordered + d.removed.expired;
    return d.open + d.recovered + d.returned + removed === 0;
}

function Stat({
    label,
    value,
    children,
    className,
}: {
    label: string;
    value: number | string;
    children?: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("min-w-0", className)}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-xl font-bold tabular-nums text-foreground">{value}</dd>
            {children && <dd className="text-xs text-muted-foreground">{children}</dd>}
        </div>
    );
}
